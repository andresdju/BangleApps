var ExStats = require("exstats");
var B2 = process.env.HWVERSION===2;
var Layout = require("Layout");
var locale = require("locale");
var fontHeading = "6x8:2";
var fontValueSmall = B2 ? "6x15:2" : "6x8:3";
var fontValueLarge = B2 ? "6x15:4" : "6x8:6";
var fixCount = 0;
var isMenuDisplayed = false;

g.clear();
Bangle.loadWidgets();
Bangle.drawWidgets();

// ---------------------------
let settings = Object.assign({
  record: true,
  B1: "time",
  B2: "pacea",
  B3: "dist",
  B4: "caden",
  B5: "pacec",
  B6: "bpm",
  paceLength: 1000,
  notify: {
    dist: {
      value: 0,
      notifications: [],
    },
    step: {
      value: 0,
      notifications: [],
    },
    time: {
      value: 0,
      notifications: [],
    },
  },
}, require("Storage").readJSON("run.json", 1) || {});
var statIDs = [settings.B1,settings.B2,settings.B3,settings.B4,settings.B5,settings.B6].filter(s=>s!=="");
var exs = ExStats.getStats(statIDs, settings);
// ---------------------------

function setStatus(running) {
  layout.status.label = running ? "RUN" : "STOP";
  layout.status.bgCol = running ? "#0f0" : "#f00";
  layout.render();
}

// Called to start/stop running
function onStartStop() {
  var running = !exs.state.active;
  var prepPromises = [];

  // start/stop recording
  // Do this first in case recorder needs to prompt for
  // an overwrite before we start tracking exstats
  if (settings.record && WIDGETS["recorder"]) {
    if (running) {
      isMenuDisplayed = true;
      prepPromises.push(
        WIDGETS["recorder"].setRecording(true,{force:"new"}).then(() => {
          isMenuDisplayed = false;
          layout.setUI(); // grab our input handling again
          layout.forgetLazyState();
          layout.render();
        })
      );
    } else {
      prepPromises.push(
        WIDGETS["recorder"].setRecording(false)
      );
    }
  }

  if (!prepPromises.length) // fix for Promise.all bug in 2v12
    prepPromises.push(Promise.resolve());

  Promise.all(prepPromises)
    .then(() => {
      if (running) {
        exs.start();
      } else {
        exs.stop();
      }
      // if stopping running, don't clear state
      // so we can at least refer to what we've done
      setStatus(running);
    });
}

var lc = [];
// Load stats in pair by pair
for (var i=0;i<statIDs.length;i+=2) {
  var sa = exs.stats[statIDs[i+0]];
  var sb = exs.stats[statIDs[i+1]];
  if (i==0){
    lc.push({ type:"h", filly:1, c:[
      sa?{type:"txt", font:fontValueLarge, label:sa.getString(), id:sa.id, fillx:1 }:{}
    ]});
  }
  else{
    lc.push({ type:"h", filly:1, c:[
      sa?{type:"txt", font:fontValueSmall, label:sa.getString(), id:sa.id, fillx:1 }:{},
      sb?{type:"txt", font:fontValueSmall, label:sb.getString(), id:sb.id, fillx:1 }:{}
    ]});
  }
  if (sa) sa.on('changed', e=>layout[e.id].label = e.getString());
  if (sb) sb.on('changed', e=>layout[e.id].label = e.getString());
}
// At the bottom put time/GPS state/etc
lc.push({ type:"h", filly:1, c:[
  {type:"txt", font:fontHeading, label:"GPS", id:"gps", fillx:1, bgCol:"#f00" },
  {type:"txt", font:fontHeading, label:"00:00", id:"clock", fillx:1, bgCol:g.theme.fg, col:g.theme.bg },
  {type:"txt", font:fontHeading, label:"---", id:"status", fillx:1 }
]});
// Now calculate the layout
var layout = new Layout( {
  type:"v", c: lc
},{lazy:true, btns:[{ label:"---", cb: onStartStop, id:"button"}]});
delete lc;
setStatus(exs.state.active);
layout.render();

function configureNotification(stat) {
  stat.on('notify', (e)=>{
    settings.notify[e.id].notifications.reduce(function (promise, buzzPattern) {
        return promise.then(function () {
          return Bangle.buzz(buzzPattern[0], buzzPattern[1]);
        });
    }, Promise.resolve());
  });
}

Object.keys(settings.notify).forEach((statType) => {
  if (settings.notify[statType].increment > 0 && exs.stats[statType]) {
      configureNotification(exs.stats[statType]);
  }
});

// Handle GPS state change for icon
Bangle.on("GPS", function(fix) {
  layout.gps.bgCol = fix.fix ? "#0f0" : "#f00";
  if (!fix.fix) return; // only process actual fixes
  if (fixCount++ === 0) {
    Bangle.buzz(); // first fix, does not need to respect quiet mode
  }
});
// We always call ourselves once a second to update
setInterval(function() {
  layout.clock.label = locale.time(new Date(),1);
  if (!isMenuDisplayed) layout.render();
}, 1000);