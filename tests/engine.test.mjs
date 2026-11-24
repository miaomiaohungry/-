import test from 'node:test';
import assert from 'node:assert/strict';
import {compare, simulate, ordinaryFare, buildTrips, dayNumber} from '../dist/engine.js';
import {RULES,monthDays,dayInfo} from '../dist/rules.js';
const settings = {fare:7,busFare:2,outbound:'bus-metro',inbound:'metro-bus',roundTrip:true,prior:0,
  transferEnabled:true,threshold:90,discount:.9,transfer:1,activation:'',validityDays:31,order:'discount-first'};
const days = count => monthDays('2026-12').slice(0,count);

test('18 / 19 round trip break-even and the 45th single ride', () => {
  for (const [count,normal,card] of [[18,27260,28200],[19,28720,28600],[23,34560,30800]]) {
    const result = compare(days(count),settings,[RULES.packs[1]]);
    assert.equal(result.results[0].total,normal);
    assert.equal(result.results[1].total,card);
  }
});
test('threshold uses actual metro spending and starts discount on the following ride', () => {
  const result = compare(days(8),settings,[]).best;
  assert.equal(result.rows[13].accumulated,9100);
  assert.equal(result.rows[13].discounted,false);
  assert.equal(result.rows[14].discounted,true);
  assert.equal(result.total,12660);
});
test('transfer order, missing bus, zero bus fare and initial spending', () => {
  assert.equal(ordinaryFare({mode:'bus-metro'},9000,settings).metro,530);
  assert.equal(ordinaryFare({mode:'bus-metro'},9000,{...settings,order:'transfer-first'}).metro,540);
  assert.deepEqual(ordinaryFare({mode:'none'},0,settings),{metro:700,bus:0});
  assert.deepEqual(ordinaryFare({mode:'metro-bus'},0,{...settings,busFare:0}),{metro:700,bus:0});
  assert.equal(compare(days(1),{...settings,prior:90},[]).best.total,1460);
  assert.equal(compare(days(1),{...settings,transferEnabled:false},[]).best.total,1800);
});
test('zero days has zero regular cost and includes full purchase cost for each pass', () => {
  const {results,best} = compare([],settings,RULES.packs);
  assert.equal(best.total,0);
  assert.deepEqual(results.slice(1).map(r=>r.total),[19000,21000,27000,39000]);
});
test('expiry is inclusive, covers leap dates, and honors custom activation', () => {
  const pack = RULES.packs[1];
  const trips = buildTrips(['2026-12-01','2026-12-31'],settings);
  assert.equal(simulate(trips,{...settings,activation:'2026-12-01'},pack).used,4);
  assert.equal(simulate(trips,{...settings,activation:'2026-12-01',validityDays:30},pack).used,2);
  assert.equal(simulate(trips,{...settings,activation:'2027-01-01'},pack).used,0);
  assert.equal(monthDays('2028-02').length,29);
  assert.equal(dayNumber('2028-03-01')-dayNumber('2028-02-28'),2);
});
test('holiday and makeup days', () => {
  assert.equal(dayInfo('2027-02-05').selected,false);
  assert.equal(dayInfo('2027-02-14').selected,true);
  assert.equal(dayInfo('2026-10-10').selected,true);
  assert.equal(monthDays('2026-12').filter(d=>dayInfo(d).selected).length,23);
});
test('optimized paths match independent exhaustive enumeration of all payment choices', () => {
  // Small synthetic packs allow complete enumeration, including reaching the threshold mid-route.
  for (const order of ['discount-first','transfer-first']) {
    for (const prior of [0,78,90]) {
      const s = {...settings,order,prior,validityDays:30,activation:'2026-12-02'};
      const trips = buildTrips(days(5),s);
      const pack = {rides:4,price:15};
      let lowest = Infinity;
      for (let mask=0;mask<2**trips.length;mask++) {
        let used=0,cost=1500,acc=prior*100,valid=true;
        for (let i=0;i<trips.length;i++) {
          if ((mask>>i)&1) {
            used++;
            if (trips[i].date < s.activation || used>4) {valid=false;break;}
            cost+=200;
          } else {
            const {metro,bus}=ordinaryFare(trips[i],acc,s);
            cost+=metro+bus; acc+=metro;
          }
        }
        if(valid) lowest=Math.min(lowest,cost);
      }
      assert.equal(simulate(trips,s,pack).total,lowest);
    }
  }
});
