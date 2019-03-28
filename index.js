const axios = require('axios');
const cheerio = require('cheerio');
const MongoClient = require('mongodb').MongoClient;

// Connection URL
const uri = 'mongodb://localhost:27017';
// const uri = "mongodb+srv://bgg-app:nullCkzFfO2vRdCixUD@cluster0-f4efh.mongodb.net/bgg";

const client = new MongoClient(uri, { useNewUrlParser: true });

// Use connect method to connect to the server
client.connect(err => {
  console.log('Connected successfully to Mongo DB.');

  const gamesCollection = client.db('bgg').collection('games');
  gamesCollection.createIndex({ id: 1 }, { unique: true });

  const fetchPageOfGames = pageNum => {
    console.log(`Grabbing page ${pageNum}...`);
    return axios
      .get(`https://www.boardgamegeek.com/browse/boardgame/page/${pageNum}`)
      .then(res => {
        const $ = cheerio.load(res.data);
        const linkElems = $('.collection_thumbnail a');
        const links = [];
        linkElems.each(function () {
          links.push(this.attribs.href);
        });
        const ids = links.map(id => /(\d+)/.exec(id)[0]);

        return axios
          .get(`https://www.boardgamegeek.com/xmlapi2/thing?type=boardgame&stats=1&id=${ids.join(',')}`)
          .then(res => {
            const games = parseGames(res.data);
            games.forEach(game =>
              gamesCollection.update(game, game, { upsert: true })
            );
            console.log(`Import of page ${pageNum} complete.`);
          });
      });
  }

  const fetchPagesOfGames = async (start = 1, end) => {
    let curr = start;
    while(curr <= end) {
      await fetchPageOfGames(curr);
      curr++;
    }
    gamesCollection.find({}).toArray((err, docs) => {
      console.log(`Done importing pages ${start} through ${end} (${end - start + 1} total). ${docs.length} games present in database.`);
      client.close();
    });
  }

  fetchPagesOfGames(1, 10);

});

const parseGames = xml => {
  const $ = cheerio.load(xml, { xmlMode: true });
  const games = [];
  $('item').each(function () {
    // Extract recommended and best number of players
    const $recommendedPlayerOptions = $(this).find(
      'poll[name=suggested_numplayers] results'
    );
    let bestPlayerCount = { value: 'Unknown', votes: 0 };
    const recommendedPlayerCounts = [];
    $recommendedPlayerOptions.each((idx, el) => {
      const best = Number(
        $(el)
          .find('result[value="Best"]')
          .attr('numvotes')
      );
      const recommended = Number(
        $(el)
          .find('result[value="Recommended"]')
          .attr('numvotes')
      );
      const notRecommended = Number(
        $(el)
          .find('result[value="Not Recommended"]')
          .attr('numvotes')
      );
      if (best > bestPlayerCount.votes) {
        bestPlayerCount = {
          value: $(el).attr('numplayers'),
          votes: best
        };
      }
      if (recommended > notRecommended) {
        recommendedPlayerCounts.push($(el).attr('numplayers'));
      }
    });

    // Extract recommended minimum age
    const $recommendedMinAge = $(this).find(
      'poll[name=suggested_playerage] result'
    );
    let recommendedMinAge = { value: 'Unknown', votes: 0 };
    $recommendedMinAge.each((i, el) => {
      const votes = Number($(el).attr('numvotes'));
      if (votes > recommendedMinAge.votes) {
        recommendedMinAge = {
          value: $(el).attr('value'),
          votes
        };
      }
    });

    const game = {
      id: Number(this.attribs.id),
      type: this.attribs.type,
      thumbnail: $(this).find('thumbnail').text(),
      image: $(this).find('image').text(),
      name: $(this).find('name').attr('value'),
      description: $(this).find('description').text(),
      yearPublished: Number($(this).find('yearpublished').attr('value')),
      minPlayers: Number($(this).find('minplayers').attr('value')),
      maxPlayers: Number($(this).find('maxplayers').attr('value')),
      bestPlayers: Number(bestPlayerCount.value),
      recommendedPlayers: recommendedPlayerCounts,
      playTime: Number($(this).find('playingtime').attr('value')),
      minPlayTime: Number($(this).find('minplaytime').attr('value')),
      maxPlayTime: Number($(this).find('maxplaytime').attr('value')),
      minimumAge: Number($(this).find('minage').attr('value')),
      userRecommendedMinAge: Number(recommendedMinAge.value),
      categories: [],
      mechanics: [],
      families: [],
      expansions: [],
      designers: [],
      artists: [],
      publishers: [],
      usersRated: Number($(this).find('usersrated').attr('value')),
      averageRating: Number($(this).find('average').attr('value')),
      bayesAverageRating: Number($(this).find('bayesaverage').attr('value')),
      complexity: Number($(this).find('averageweight').attr('value'))
    };

    const extractLinks = (xmlName, targetName) => {
      $(this)
        .find(`link[type=${xmlName}]`)
        .each((i, el) => {
          game[targetName].push($(el).attr('value'));
        });
    };

    extractLinks('boardgamecategory', 'categories');
    extractLinks('boardgamemechanic', 'mechanics');
    extractLinks('boardgamefamily', 'families');
    extractLinks('boardgameexpansion', 'expansions');
    extractLinks('boardgamedesigner', 'designers');
    extractLinks('boardgameartist', 'artists');
    extractLinks('boardgamepublisher', 'publishers');

    games.push(game);
  });
  return games;
};
