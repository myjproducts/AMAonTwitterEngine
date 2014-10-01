var consoleHolder = console;
function debug(bool){
    if(!bool){
        consoleHolder = console;
        console = {};
        console.log = function(){};
    }else
        console = consoleHolder;
}

var express = require('express')
//  , routes = require('./routes')
  , util = require('util')
  , http = require('http')
  , _ = require('underscore')
  , twitter = require('ntwitter')
  , ntwitter = require('immortal-ntwitter')
  , passport = require('passport')
  , TwitterStrategy = require('passport-twitter').Strategy
  , path = require('path');

var common = require('./common');
var config = common.config();

var info = require('./info.json');
console.log(info.pref);

var app = express()
  , server = require('http').createServer(app)
  , io = require('socket.io').listen(server);
var RedisStore = require('socket.io/lib/stores/redis');
 
var SessionStore = require('session-mongoose')(express)

var redis = require('redis');
var rtg = require("url").parse(config.redis);
var pub = redis.createClient(rtg.port, rtg.hostname);
pub.auth(rtg.auth.split(":")[1]);
var sub = redis.createClient(rtg.port, rtg.hostname);
sub.auth(rtg.auth.split(":")[1]);

var client = redis.createClient(rtg.port, rtg.hostname);
client.auth(rtg.auth.split(":")[1]);
io.set('store', new RedisStore({redis:redis, redisPub:pub, redisSub:sub, redisClient:client}));

sub.subscribe('Pub');

var TWITTER_CONSUMER_KEY = config.twitter_consumer_key;
var TWITTER_CONSUMER_SECRET = config.twitter_secret;
// Passport sessionのセットアップ
passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null, obj);
});

// PassportでTwitterStrategyを使うための設定
passport.use(new TwitterStrategy({
  consumerKey: TWITTER_CONSUMER_KEY,
  consumerSecret: TWITTER_CONSUMER_SECRET,
  callbackURL: "http://"+config.host+"/auth/twitter/callback"
},
function(token, tokenSecret, profile, done) {
    profile.twitter_token = token;
    profile.twitter_token_secret = tokenSecret;

    process.nextTick(function () {
      return done(null, profile);
    });
  }
));

/**
 *
 *  MongoDB model
 *
 */
var mongoose = require('mongoose');
mongoose.connect(config.mongo, config.mongo_options);
var Post = require('./models/posts');
var Reply = require('./models/replies');
var Retweet = require('./models/retweet');

/**
 *
 *  Express Config
 *
 */
// all environments
app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(express.cookieParser());
//app.use(express.session({secret: "_asktokyo2014_ErjM0Kkv9BavM9NHNjv"}));
// セッションストアを設定
app.use(express.session({
  secret: '_asktokyo2014_ErjM0Kkv9BavM9NHNjv',
  store: new SessionStore({
    url: config.session_host,
    connection: mongoose.connection,
    interval: 7 * 24 * 60 * 60 * 1000 // Interval in seconds to clear expired sessions. 1week
  }),
  cookie: {
    httpOnly: false,
    // 60 * 60 * 1000 = 3600000 msec = 1 hour
    maxAge: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  }
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

app.enable('jsonp callback');
app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
  debug(true);
});

app.configure('staging', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
  debug(true);
});

app.configure('production', function(){
  app.use(express.errorHandler());
  debug(false);
});

process.on('uncaughtException', function (err) {
       consoleHolder.log('uncaughtException => ' + err.stack);
});
server.listen(app.get('port'));

/**
 *
 *  routing
 *
 */

app.get('/', function (req, res) {
  res.render('index', {
    socketio_url: config.socketio_url,
    from: req.query.from,
    site_name: info.site_name,
    pref: info.pref,
    voting_date: info.voting_date,
    year: info.year,
    period_of_asking: info.period_of_asking,
    candidates: info.candidates,
    twitter_id: info.twitter_id,
    fb_app_id: info.fb_app_id,
    analystics_id: info.analystics_id,
    max_tweet_length: 100
  });
});

app.get('/memberonlyadminpage', function (req, res) {
  res.render('admin', {
     socketio_url: config.socketio_url,
     from: req.query.from,
     max_tweet_length: 100
  });
});

app.get('/api/fetch_hash_tweets', function (req, res) {
  var limit = req.query.limit;
  var from_id = req.query.from_id;
  if(!limit){limit = 20;}
  if(limit > 100){limit = 100;}
  if(limit < 0 ){limit = 1;}
  var query = Post.find({});
  if(from_id){
    query.where('_id').lt(from_id);
  }
  query.sort({ created_at: -1 }).limit(limit).exec('find', function(err, docs){
    if(err){
      console.log(err);
      res.json({
        from_id: null,
        to_id: null,
        tweets:[]
      });
      return;
    }
    if(docs.length > 0){
      var tweets = _.map(docs, create_hash);
      res.json({
        from_id: _.first(docs)._id,
        to_id: _.last(docs)._id,
        tweets: tweets
      });
    }else{
      res.json({
        from_id: null,
        to_id: null,
        tweets:[]
      });
    }
  });
});

app.get('/api/answers', function (req, res) {
  Reply.find({}).sort({ updated_at : -1 }).skip(0).exec('find', function(err, replies){
    var tweets = [];
    for(var i = 0; i < replies.length; i++){
      var answers = _.map(replies[i].posts, create_hash);
      tweets.push({
        q_id_str: replies[i].q_id_str,
        a_user_id_str: replies[i].a_user_id_str,
        a_user_name: replies[i].a_user_name,
        question: replies[i].question,
        created_at: replies[i].created_at,
        updated_at: replies[i].updated_at,
        answers: answers
      });
    }
    res.json({tweets: tweets});
  });
});

// Twitterの認証
app.get("/auth/twitter", passport.authenticate('twitter'));

// Twitterからのcallback
app.get("/auth/twitter/callback", passport.authenticate('twitter', {
  successRedirect: '/tweet',
  failureRedirect: '/'
}));

// タイムラインへ投稿
app.post('/tweet', function(req,res){
  var text = req.body.text;
  text += " " + config.twitter_add_hashtag + " " + config.twitter_add_url;
  console.log('text', text);
  // TODO: text validation
  if(!req.user){
    // 認証ページへ
    console.log('a');
    req.session.text = text;
    res.redirect('/auth/twitter');
    return true;
  }else if(!req.user.twitter_token && !req.user.twitter_token_secret){
    console.log('b');
    // 認証ページへ
    req.session.text = text;
    res.redirect('/auth/twitter');
    return true;
  }
  var twit = new twitter({
    consumer_key: TWITTER_CONSUMER_KEY,
    consumer_secret: TWITTER_CONSUMER_SECRET,
    access_token_key: req.user.twitter_token,
    access_token_secret: req.user.twitter_token_secret
  });
  twit.post( "https://api.twitter.com/1.1/statuses/update.json",
            {
              status : text
            },
            function(err, data){
              if(err){
                console.log(err.data);
                res.send({stat: 'error'});
                return;
              }
              var post = new Post(data);
              var json_data = {
                username:data.user.screen_name,
                icon:data.user.profile_image_url,
                text:data.text,
                id_str:data.id_str,
                mongo_id: post._id,
                created_at: new Date()
              }
              var pub_data = {type : 'stream', data : json_data};
              pub.publish('Pub', JSON.stringify(pub_data));
              res.send({stat: 'success'});
            });
});

// タイムラインへ投稿(認証画面からのリダイレクト)
app.get('/tweet', function(req,res){
  console.log('get');
  var text = req.session.text;
  // TODO: validation
  if(!req.user && !req.user.twitter_token && !req.user.twitter_token_secret){
    // 認証ページへ
    req.session.text = text;
    res.redirect('/auth/twitter');
    return true;
  }
  var twit = new twitter({
    consumer_key: TWITTER_CONSUMER_KEY,
    consumer_secret: TWITTER_CONSUMER_SECRET,
    access_token_key: req.user.twitter_token,
    access_token_secret: req.user.twitter_token_secret
  });
  twit.post( "https://api.twitter.com/1.1/statuses/update.json",
            {
              status : text
            },
            function(err, data){
              if(err){
                console.log(err.data);
                res.redirect('/');
                return;
              }
              var post = new Post(data);
              var json_data = {
                username:data.user.screen_name,
                icon:data.user.profile_image_url,
                text:data.text,
                id_str:data.id_str,
                mongo_id: post._id,
                created_at: new Date()
              }
              var pub_data = {type : 'stream', data : json_data};
              pub.publish('Pub', JSON.stringify(pub_data));
              res.redirect('/?from=twitter');
            });
});

/**
 *  for debug
 */

app.get('/api/fetch_hash_tweets_test', function (req, res) {
  var limit = req.query.limit;
  if(!limit){limit = 20;}
  if(limit > 100){limit = 100;}
  if(limit < 0 ){limit = 1;}
  var dammy = [];
  for(var i = 0; i < limit; i++ ){
    dammy.push({
        screen_name:'tsuda',
        id_str:'1234565544556654323',
        text:'ほげほげー！！',
        profile_image_url:'http://twitter.com/image/hogehoge.png',
        created_at:'Sun Jan 19 15:32:30 +0000 2014'
      });
  }
  res.json({
    from_id: 'hoge',
    to_id: 'hoge',
    tweets: dammy
  });
});

app.get('/api/answers_test', function (req, res) {
  var dammy = [];
  for(var i = 0; i < 30; i++ ){
    dammy.push({
      'q_id_str':'123456789',
      'a_user_id_str':'21229837123343',
      'a_user_name':'toshio_tamogami',
      'created_at':'2014-01-22T16:14:31.141Z',
      'updated_at':'2014-01-22T16:14:31.141Z',
      'dialogs':[
          {
              'screen_name':'tsuda',
              'id_str':'1234565544556654323',
              'text':'ほげほげー！！',
              'profile_image_url':'http://twitter.com/image/hogehoge.png',
              'created_at':'Sun Jan 19 15:32:30 +0000 2014'
          },
          {
              'screen_name':'tsuda',
              'id_str':'1234565544556654323',
              'text':'ほげほげー！！',
              'profile_image_url':'http://twitter.com/image/hogehoge.png',
              'created_at':'Sun Jan 19 15:32:30 +0000 2014'
          },
      ]
    });
  }
  res.json({
    tweets: dammy
  });
});

/**
 *
 *  socket.io
 *
 */

//sub.on('message', function (channel, message) {
//  console.log('sub message' + message);
//});
io.configure('development', function(){
  io.enable('browser client etag');
  io.enable('browser client minification');
  io.enable('browser client gzip');
  io.set('log level', 1);

  io.set('transports', [
    'websocket'
  , 'flashsocket'
  , 'htmlfile'
  , 'xhr-polling'
  , 'jsonp-polling'
  ]);
});
io.configure('production', function(){
  io.enable('browser client etag');
  io.enable('browser client minification');
  io.enable('browser client gzip');
  io.set('log level', 1);

  io.set('transports', [
    'websocket'
  , 'flashsocket'
  , 'htmlfile'
  , 'xhr-polling'
  , 'jsonp-polling'
  ]);
});
io.sockets.on('connection', function (socket) {
  sub.on('message', function (channel, message) {
    console.log('sub channel ' +channel+ ' message' + message);
    message = JSON.parse(message);
    var type = message.type;
    console.log(type);
    console.log(message.data);
    if(type == 'stream'){
      socket.emit('tweet', {message: JSON.stringify(message.data)});
    }else if(type == 'rep'){
      socket.emit('answer', {message: JSON.stringify(message.data)});
      console.log('emit answer');
    }else if(type == 'retweet'){
      socket.emit('tweet', {message: JSON.stringify(message.data)});
    }
  });

});

/**
 *  @utsunomiyakenji  宇都宮けんじ : 914304680
 *  @MasuzoeYoichi 舛添要一 :  153717550
 *  @toshio_tamogami 田母神俊雄 : 102388128
 *  @morihirotokyo 細川護煕 : 2291282737
 *  @hbkr 家入一真 : 12392332
 *  
 *  @AskTokyo2014 : 2311332774
 * 
 *  @shakezoomer : 220981536
 * 
 *  テスト用アカウント
 *   @shakeshaketest : 2148215468 // 公式アカウントとする
 *   @testtest1111 : 1525225614  // 一般ユーザーとする
 *   @testtest2222 : 1525274156  // 候補者とする
 *   @testtest3333 : 1525299727  // 候補者とする
 *   @testtest4444 : 1525296428  // 候補者とする
 **/

var tweet_list = [];
var HASH_TAG = config.twitter_tracking_hashtag;
var utsunomiya = "914304680",
    masuzoe = "153717550",
    hosokawa = "2291282737",
    ieiri = "12392332",
    tamogami = "102388128";
var testtest1111 = "1525225614";
var testtest2222 = "1525274156";
var testtest3333 = "1525299727";
//var testtest4444 = "1525296428";
var testtest4444 = "8175762";  //ramusara

////var USER_IDS = utsunomiya + "," + masuzoe + "," + tamogami+ "," + hosokawa + "," + ieiri;
////var USER_ARRAY = [utsunomiya, masuzoe, tamogami, hosokawa, ieiri];

//// test
var USER_IDS = testtest2222 + "," + testtest3333 + "," + testtest4444;
var USER_ARRAY = [testtest2222, testtest3333, testtest4444];

var AskTokyo2014 = "147554237"; // 本物
////var AskTokyo2014 = "2311332774"; // 本物
////var AskTokyo2014 = "220981536"; // shakezoomer
////var AskTokyo2014 = "2148215468"; // shakeshaketest
USER_IDS += "," + AskTokyo2014;
////USER_ARRAY.push(AskTokyo2014); // デバッグ用

process.on('uncaughtException', function(err) {
    consoleHolder.log('uncaughtException => ' + err.stack);
});

var ntwit = ntwitter.create({
      consumer_key:         config.twitter_consumer_key,
      consumer_secret:      config.twitter_secret,
      access_token_key:     config.twitter_access_token,
      access_token_secret:  config.twitter_access_secret
    });

ntwit.immortalStream('statuses/filter', {track: HASH_TAG, follow: USER_IDS, replies:'all'}, function(immortalStream) {
   immortalStream.on('data', function(data){
      if(!data){ return true}
      if(!data.user){ return true}
      if(!_.contains(USER_ARRAY, data.user.id_str)){
        if(data.entities.hashtags.length == 0){
          return true;
        }
        for(var i=0; i<data.entities.hashtags.length; i++){
          if(data.entities.hashtags[i].text == config.raw_hashtag){
            // 候補者のツイート以外をDBに保存
            console.log('have hashtag');
            if(data.source.indexOf(config.tweet_source) == -1){
              console.log('souce is other ');
              var post = new Post(data);
              post.created_at = new Date();
              post.save( function(err) {
                if (err) consoleHolder.error(err);
              });
              var json_data = {
                username:data.user.screen_name,
                icon:data.user.profile_image_url,
                text:data.text,
                id_str:data.id_str,
                mongo_id: post._id,
                created_at: new Date()
              }
              var pub_data = {type : 'stream', data : json_data};
              pub.publish('Pub', JSON.stringify(pub_data));
            }
          }
        }
      }
      if(data.in_reply_to_status_id_str){
        // リプライあり
        //if(_.contains(USER_ARRAY, data.in_reply_to_user_id_str)){
        //  // 候補者へのリプライ
        //  make_replies(data);
        //} 
        if(_.contains(USER_ARRAY, data.user.id_str)){
          // 候補者からのリプライ
          make_replies(data);
          console.log("reply!!!!!!");
        }
      }
      if(data.user.id_str == AskTokyo2014){
        // 運営アカウントのツイート
        console.log(data);
        console.log("RT!!!!!!!");
        if(data.retweeted_status){
          // 運営アカウントのリツイート
          var retweet = new Retweet(data.retweeted_status);
          retweet.created_at = new Date();
          retweet.save( function(err) {
            if (err) consoleHolder.error(err);
          });
          var json_data = {
            screen_name: retweet.user.screen_name,
            profile_image_url: retweet.user.profile_image_url,
            text: retweet.text,
            id_str: retweet.id_str,
            mongo_id: retweet._id,
            created_at: new Date()
          }
          var pub_data = {type : 'retweet', data : json_data};
          pub.publish('Pub', JSON.stringify(pub_data));
         // if(data.retweeted_status.in_reply_to_status_id_str){
         //   // 誰かへのリプライをリツイート
         //   var reply_id = data.retweeted_status.in_reply_to_status_id_str;
         //   Reply.findOne({}).elemMatch( 'posts', { id_str: reply_id}).exec(function(err, rep){
         //     if(err){
         //       consoleHolder.error(err);
         //       return err;
         //     }
         //     //rep.posts.push()
         //   });
         // }
        }
      }
    });
});

function make_replies(post){
  var rep_id = post.in_reply_to_status_id_str;
  console.log('rep_id', rep_id);
  Reply.findOne({'q_id_str': rep_id, 'a_user_id_str' : post.user.id_str}, function(err, rep){
    if(err){
      consoleHolder.error(err);
      return err;
    }
  //  console.log("Reply data",rep)
    if(rep){
      // 既に保存されている会話に追加
      console.log("have reply data");
      rep.posts.push(post);
      rep.updated_at = new Date();
      rep.save(function(err){
        if (err) consoleHolder.error(err);
      });
      var answers = [];
      for(var i=0; i<rep.posts.length; i++){
        answers.push(create_hash(rep.posts[i]));
      }
      var json = {
        type : 'rep',
        data : {
          q_id_str: rep.q_id_str,
          a_user_id_str: post.user.id_str,
          question : rep.question,
          answers: answers,
          created_at: rep.created_at,
          updated_at: rep.updated_at
        }
      };
      pub.publish('Pub', JSON.stringify(json));
    }else{
      Retweet.findOne({'id_str' : rep_id}, function (err, tweet) {
        if(err){
          consoleHolder.error(err);
          return err;
        }
      //  console.log("Post data", tweet)
        if(tweet){
          // Postに保存されているものに対して返事
          console.log('have Post data');
          var reply = new Reply();
          reply.posts.push(post);
          reply.q_id_str = tweet.id_str;
          reply.a_user_id_str = post.user.id_str;
          reply.a_user_name = post.user.screen_name;
          reply.question.screen_name = tweet.user.screen_name;
          reply.question.id_str = tweet.id_str;
          reply.question.text = tweet.text;
          reply.question.profile_image_url = tweet.user.profile_image_url;
          reply.question.created_at = tweet.created_at;
          reply.created_at = new Date();
          reply.updated_at = new Date();
          reply.save( function(err) {
            if (err) console.error(err);
          });
          var question = create_hash(tweet);
          var answers = [create_hash(post)];
          var json = {
            type : 'rep',
            data : {
              q_id_str: tweet.id_str,
              a_user_id_str: post.user.id_str,
              question: question,
              answers: answers,
              created_at: reply.created_at
            }
          }
          pub.publish('Pub', JSON.stringify(json));
        }else{
          console.log('no data');
        }
      });

    }
  });
}

function create_hash(data){
  var res = {
    screen_name: data.user.screen_name,
    id_str: data.id_str,
    in_reply_to_status_id_str: data.in_reply_to_status_id_str,
    text: data.text,
    profile_image_url: data.user.profile_image_url,
    created_at: data.created_at
  };
  return res;
}
