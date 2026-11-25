// All monetary arithmetic uses integer cents. The monthly threshold counts metro payments only.
const cents = value => Math.round(value * 100);
export const dayNumber = date => Math.round(Date.parse(date + 'T00:00:00Z') / 86400000);
export function ordinaryFare(trip, accumulated, settings) {
  const discount = accumulated >= cents(settings.threshold) ? settings.discount : 1;
  const transfer = settings.transferEnabled && trip.mode !== 'none' ? cents(settings.transfer) : 0;
  let metro = cents(settings.fare);
  let bus = trip.mode === 'none' ? 0 : cents(settings.busFare);
  if (trip.mode === 'bus-metro') {
    metro = Math.round(Math.max(0, metro - transfer) * discount);
  } else {
    metro = Math.round(metro * discount);
    bus = Math.max(0, bus - transfer);
  }
  return {metro, bus};
}
export function buildTrips(dates, settings) {
  return [...dates].sort().flatMap(date => {
    const legs = [{date, leg:'去程', mode:settings.outbound}];
    if (settings.roundTrip) legs.push({date, leg:'回程', mode:settings.inbound});
    return legs;
  });
}
function describe(trips, settings, pack, path) {
  let accumulated = cents(settings.prior);
  let metro = 0, bus = 0, used = 0, reached = null;
  const rows = trips.map((trip, index) => {
    const card = path[index] === '1';
    const fare = card ? {metro:0,bus:trip.mode === 'none' ? 0 : cents(settings.busFare)} : ordinaryFare(trip, accumulated, settings);
    const discounted = !card && accumulated >= cents(settings.threshold);
    const previous = accumulated;
    if (!card) accumulated += fare.metro;
    if (!reached && previous < cents(settings.threshold) && accumulated >= cents(settings.threshold)) reached = `${trip.date} ${trip.leg}`;
    if (card) used++;
    metro += fare.metro;
    bus += fare.bus;
    return {...trip, ...fare, card, discounted, accumulated};
  });
  const purchase = pack ? cents(pack.price) : 0;
  return {pack, purchase, metro, bus, total:purchase + metro + bus, used, unused:pack ? pack.rides - used : 0,
    ordinary:trips.length - used, reached, accumulated, rows};
}
export function simulate(trips, settings, pack = null) {
  if (!pack) return describe(trips, settings, null, '0'.repeat(trips.length));
  const start = dayNumber(settings.activation || trips[0]?.date || '2000-01-01');
  const end = start + settings.validityDays - 1;
  const threshold = cents(settings.threshold);
  let states = new Map([['0:' + Math.min(cents(settings.prior), threshold),
    {used:0, accumulated:Math.min(cents(settings.prior), threshold), cost:0, path:''}]]);
  // Dynamic programming considers both payment choices on every ride. Capped cumulative
  // spending is sufficient once the discount activates. A state keeps its cheapest path.
  for (const trip of trips) {
    const next = new Map();
    const eligible = dayNumber(trip.date) >= start && dayNumber(trip.date) <= end;
    function retain(state) {
      const key = `${state.used}:${state.accumulated}`;
      if (!next.has(key) || state.cost < next.get(key).cost) next.set(key, state);
    }
    for (const state of states.values()) {
      const fare = ordinaryFare(trip, state.accumulated, settings);
      retain({used:state.used, accumulated:Math.min(threshold,state.accumulated + fare.metro),
        cost:state.cost + fare.metro + fare.bus, path:state.path + '0'});
      if (eligible && state.used < pack.rides) {
        retain({used:state.used + 1, accumulated:state.accumulated,
          cost:state.cost + (trip.mode === 'none' ? 0 : cents(settings.busFare)), path:state.path + '1'});
      }
    }
    states = next;
  }
  const best = [...states.values()].reduce((best, item) => item.cost < best.cost ? item : best);
  return describe(trips, settings, pack, best.path);
}
export function compare(dates, settings, packs) {
  const trips = buildTrips(dates, settings);
  const results = [simulate(trips,settings), ...packs.map(pack => simulate(trips,settings,pack))];
  const best = results.reduce((best,item) => item.total < best.total ? item : best);
  return {trips, results, best};
}
