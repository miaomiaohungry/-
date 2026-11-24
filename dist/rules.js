export const RULES = {
  checked: '2026-11-24', effective: '2026-12-01', threshold: 90, discount: 0.9, transfer: 1,
  validityDays: 31,
  source: 'https://metroplatform.tenchii.com/web/fare-query/h5/index',
  packs: [{rides:35,price:190},{rides:45,price:210},{rides:60,price:270},{rides:90,price:390}]
};
export const HOLIDAY_SOURCES = {
  2026: 'https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm',
  2027: 'https://chinajob.mohrss.gov.cn/h5/c/2026-11-09/635850.shtml'
};
const holidays = new Set();
function range(year, month, first, last) {
  for (let day = first; day <= last; day++) holidays.add(`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`);
}
[[2026,1,1,3],[2026,2,15,23],[2026,4,4,6],[2026,5,1,5],[2026,6,19,21],[2026,9,25,27],[2026,10,1,7],
 [2027,1,1,3],[2027,2,5,13],[2027,4,3,5],[2027,5,1,5],[2027,6,9,9],[2027,9,15,15],[2027,10,1,7]].forEach(args => range(...args));
const makeup = new Set(['2026-01-04','2026-02-14','2026-02-28','2026-05-09','2026-09-20','2026-10-10',
  '2027-01-31','2027-02-14','2027-05-08','2027-09-26','2027-10-09']);
export function dayInfo(date) {
  const weekday = new Date(date + 'T12:00:00').getDay();
  const holiday = holidays.has(date);
  const workday = makeup.has(date);
  return {holiday, makeup:workday, selected: workday || (!holiday && weekday !== 0 && weekday !== 6)};
}
export function monthDays(month) {
  const [year, m] = month.split('-').map(Number);
  return Array.from({length:new Date(year,m,0).getDate()}, (_,i) => `${month}-${String(i+1).padStart(2,'0')}`);
}
