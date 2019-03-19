const MongoClient = require('mongodb').MongoClient;

// Connection URL
const url = 'mongodb://localhost:27017';

// Database Name
const dbName = 'bgg';

// Use connect method to connect to the server
MongoClient.connect(url, function (err, client) {
  const db = client.db(dbName);
  const games = db.collection('games');
  const query = {
    complexity: {
      $lt: 5,
      $gt: 4.3
    }
  };

  games.find(query, { sort: { bayesAverageRating: -1 } }).toArray((err, res) => {
    res.forEach(item => console.log(item.bayesAverageRating, item.name));
    client.close();
  });
});
