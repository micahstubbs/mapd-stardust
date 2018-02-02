let width = 960;
let height = 470;
let canvas = document.getElementById('main-canvas');
let platform = Stardust.platform('webgl-2d', canvas, width, height);
platform.set3DView(Math.PI / 2, width / height);
platform.setPose(
  new Stardust.Pose(
    new Stardust.Vector3(0, 0, 200),
    new Stardust.Quaternion(0, 0, 0, 1)
  )
);
platform.clear([1, 1, 1, 1]);

// load data from mapd-core
//const query = 'SELECT * FROM demo_vote_clean LIMIT 100';
const query = 'SELECT * FROM demo_vote_clean';
const defaultQueryOptions = {};
var connector = new MapdCon();

connector
  .protocol('https')
  .host('metis.mapd.com')
  .port('443')
  .dbName('mapd')
  .user('mapd')
  .password('HyperInteractive')
  .connect((connectError, session) => {
    if (connectError) {
      return console.error('Error connecting', connectError);
    }

    session
      .getTablesAsync()
      .then(data =>
        console.log(
          'All tables available at metis.mapd.com:',
          data.map(x => x.name)
        )
      )
      .catch(error => console.error('getTablesAsync error:', error));

    session.query(query, defaultQueryOptions, (error, data) => {
      if (error) {
        return console.error('query error', error);
      }
      console.log('data returned from mapd-core', data);
      draw(data);
    });
  });

function draw(data) {
  let demovote = data;
  let mark = Stardust.mark.compile(`
            import { Cube } from P3D;

            let longitude: float;
            let latitude: float;
            let state: float;
            let stateBinIndex: float;
            let xBin: float;
            let yBin: float;
            let xyBinIndex: float;
            let index: float;

            function getPositionScatterplot(): Vector3 {
                let scaleX = 0.2;
                let scaleY = 0.3;
                return Vector3(
                    scaleX * (longitude - (-95.9386152570054)),
                    scaleY * (latitude - (37.139536624928695)),
                    0
                );
            }

            function getPositionStateBins(): Vector3 {
                return Vector3(
                    (state - 48 / 2) * 0.3 + (stateBinIndex % 10 - 4.5) * 0.02,
                    floor(stateBinIndex / 10) * 0.02 - 2.0, 0
                );
            }

            function getPositionXYBinning(): Vector3 {
                let n = 6;
                let txy = xyBinIndex % (n * n);
                let tx = txy % n;
                let ty = floor(txy / n);
                let tz = floor(xyBinIndex / (n * n));
                return Vector3(
                    (xBin - 9 / 2) * 0.6 + (tx - n / 2 + 0.5) * 0.04,
                    tz * 0.04 - 2.0,
                    (yBin - 6 / 2) * 0.6 + (ty - n / 2 + 0.5) * 0.04
                );
            }

            function clamp01(t: float): float {
                if(t < 0) t = 0;
                if(t > 1) t = 1;
                return t;
            }

            mark Mark(color: Color, t1: float, t2: float, t3: float, ki1: float, ki2: float, ki3: float) {
                let p1 = getPositionScatterplot();
                let p2 = getPositionStateBins();
                let p3 = getPositionXYBinning();
                let p = p1 * clamp01(t1 + ki1 * index) +
                    p2 * clamp01(t2 + ki2 * index) +
                    p3 * clamp01(t3 + ki3 * index);
                Cube(
                    p * 50,
                    0.7,
                    color
                );
            }
        `)['Mark'];
  let marks = Stardust.mark.create(mark, Stardust.shader.lighting(), platform);

  demovote.forEach(d => {
    d.Longitude = +d.Longitude;
    d.Latitude = +d.Latitude;
  });

  let longitudeExtent = d3.extent(demovote, d => d.Longitude);
  let latitudeExtent = d3.extent(demovote, d => d.Latitude);

  let longitudeScale = d3.scale
    .linear()
    .domain(longitudeExtent)
    .range([0, 1]);
  let latitudeScale = d3.scale
    .linear()
    .domain(latitudeExtent)
    .range([0, 1]);

  // Map states to integer.
  let states = new Set();
  let state2number = {};
  let state2count = {};
  demovote.forEach(d => states.add(d.StateAbb));
  states = Array.from(states);
  states.sort();
  states.forEach((d, i) => {
    state2number[d] = i;
    state2count[d] = 0;
  });

  let xyBinCounter = {};

  let xBinCount = 10;
  let yBinCount = 7;

  demovote.sort((a, b) => a.Obama - b.Obama);

  demovote.forEach((d, i) => {
    d.index = i;
    if (state2count[d.StateAbb] == null) state2count[d.StateAbb] = 0;
    d.stateBinIndex = state2count[d.StateAbb]++;

    let xBin = Math.floor(longitudeScale(d.Longitude) * xBinCount);
    let yBin = Math.floor(latitudeScale(d.Latitude) * yBinCount);
    let bin = yBin * (xBinCount + 1) + xBin;
    d.xBin = xBin;
    d.yBin = yBin;
    if (xyBinCounter[bin] == null) xyBinCounter[bin] = 0;
    d.xyBinIndex = xyBinCounter[bin]++;
  });

  let s1 = d3.interpolateLab('#f7f7f7', '#0571b0');
  let s2 = d3.interpolateLab('#f7f7f7', '#ca0020');

  let strToRGBA = str => {
    let rgb = d3.rgb(str);
    return [rgb.r / 255, rgb.g / 255, rgb.b / 255, 1];
  };

  let scaleColor = value => {
    if (value > 0.5) {
      return strToRGBA(s1((value - 0.5) * 2));
    } else {
      return strToRGBA(s2((0.5 - value) * 2));
    }
  };

  marks
    .attr('index', d => d.index / (demovote.length - 1))
    .attr('longitude', d => d.Longitude)
    .attr('latitude', d => d.Latitude)
    .attr('state', d => state2number[d.StateAbb])
    .attr('stateBinIndex', d => d.stateBinIndex)
    .attr('xBin', d => d.xBin)
    .attr('yBin', d => d.yBin)
    .attr('xyBinIndex', d => d.xyBinIndex)
    .attr('color', d => scaleColor(d.Obama));

  let skewing = 1;

  function transition12(t) {
    let tt = t * (1 + skewing) - skewing;
    marks
      .attr('t1', 1 - tt)
      .attr('t2', tt)
      .attr('t3', 0)
      .attr('ki1', -skewing)
      .attr('ki2', +skewing)
      .attr('ki3', 0);
  }
  function transition23(t) {
    let tt = t * (1 + skewing) - skewing;
    marks
      .attr('t1', 0)
      .attr('t2', 1 - tt)
      .attr('t3', tt)
      .attr('ki1', 0)
      .attr('ki2', -skewing)
      .attr('ki3', +skewing);
  }
  function transition31(t) {
    let tt = t * (1 + skewing) - skewing;
    marks
      .attr('t1', tt)
      .attr('t2', 0)
      .attr('t3', 1 - tt)
      .attr('ki1', +skewing)
      .attr('ki2', 0)
      .attr('ki3', -skewing);
  }

  marks.data(demovote);

  function render() {
    platform.clear([1, 1, 1, 1]);
    marks.render();
  }

  transition12(0);
  render();

  var transitions = {
    mode1mode2: t => transition12(t),
    mode2mode1: t => transition12(1 - t),
    mode2mode3: t => transition23(t),
    mode3mode2: t => transition23(1 - t),
    mode3mode1: t => transition31(t),
    mode1mode3: t => transition31(1 - t)
  };

  switches.mode_changed = (newMode, previousMode) => {
    beginTransition(t => {
      transitions[previousMode + newMode](t);
      render();
    });
  };
}
