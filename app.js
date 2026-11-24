import {RULES, dayInfo, monthDays, HOLIDAY_SOURCES} from './rules.js';
import {compare} from './engine.js';

const $ = id => document.getElementById(id);
const storageKey = 'metro-commute-planner-v1';
const defaults = {fare:7,busFare:2,outbound:'bus-metro',inbound:'metro-bus',roundTrip:true,prior:0,
  transferEnabled:true,threshold:RULES.threshold,discount:RULES.discount,transfer:RULES.transfer,
  activation:'',validityDays:31,order:'discount-first'};
const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit'}).formatToParts(new Date());
const currentMonth = `${today.find(part => part.type === 'year').value}-${today.find(part => part.type === 'month').value}`;
let month = currentMonth < '2026-12' ? '2026-12' : currentMonth;
let settings = {...defaults};
let calendars = {};
let comparison;
let detailIndex = null;
let storageAvailable = true;
try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  if (saved?.version === 1) {
    for (const key of Object.keys(defaults)) {
      if (typeof saved.settings?.[key] === typeof defaults[key]) settings[key] = saved.settings[key];
    }
    if (/^(20\d{2})-(0[1-9]|1[0-2])$/.test(saved.month) && saved.month >= '2026-01') month = saved.month;
    if (saved.calendars && typeof saved.calendars === 'object') calendars = saved.calendars;
  }
} catch { storageAvailable = false; }

const money = cents => '¥' + (cents / 100).toFixed(2);
const planName = result => result.pack ? `${result.pack.rides} 次卡` : '普通支付';
const numericFields = ['fare','busFare','prior','validityDays'];
const settingsFields = [...numericFields,'outbound','inbound','activation','order'];
const transferModes = ['none','bus-metro','metro-bus'];
function selectedDates() {
  const days = monthDays(month);
  if (!Array.isArray(calendars[month])) calendars[month] = days.filter(date => dayInfo(date).selected);
  return [...new Set(calendars[month])].filter(date => days.includes(date)).sort();
}
function persist() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({version:1,month,settings,calendars}));
    storageAvailable = true;
  } catch { storageAvailable = false; }
  $('saveState').textContent = storageAvailable ? '已保存在当前浏览器' : '浏览器存储不可用，本次设置仅在当前页面保留';
}
function renderSettings() {
  settingsFields.forEach(key => { $(key).value = settings[key]; });
  $('transferEnabled').checked = settings.transferEnabled;
  $('month').value = month;
  updateVisibility();
}
function updateVisibility() {
  document.querySelectorAll('[data-round]').forEach(button => {
    const active = (button.dataset.round === 'true') === settings.roundTrip;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
  });
  $('inboundField').hidden = !settings.roundTrip;
  const busNeeded = settings.outbound !== 'none' || (settings.roundTrip && settings.inbound !== 'none');
  $('busField').hidden = !busNeeded;
  $('busFare').disabled = !busNeeded;
  $('transferField').hidden = !busNeeded;
}
function renderCalendar() {
  const dates = monthDays(month);
  const selected = new Set(selectedDates());
  const offset = (new Date(month + '-01T12:00:00').getDay() + 6) % 7;
  let html = '<span aria-hidden="true"></span>'.repeat(offset);
  for (const date of dates) {
    const info = dayInfo(date);
    const active = selected.has(date);
    const label = info.holiday ? '，放假' : info.makeup ? '，调休上班' : '';
    html += `<button class="day ${active ? 'selected' : ''}" data-date="${date}" aria-label="${date}${label}" aria-pressed="${active}" type="button"><span class="day-number">${Number(date.slice(-2))}</span><span class="day-caption">${active ? '通勤' : '休息'}</span>${info.holiday ? '<span class="tag">休</span>' : info.makeup ? '<span class="tag makeup">班</span>' : ''}</button>`;
  }
  $('calendar').innerHTML = html;
  $('dayCount').textContent = `已选 ${selected.size} 天`;
  $('holidayNote').textContent = HOLIDAY_SOURCES[Number(month.slice(0,4))]
    ? '已计入国务院公布的放假与调休安排，可按实际出行修改。'
    : '该年份暂未收录法定节假日，默认选择周一至周五，请手动调整。';
  $('prevMonth').disabled = month === '2026-01';
  $('nextMonth').disabled = month === '2099-12';
}
function validate() {
  if (!$('settingsForm').checkValidity()) return '请输入有效票价和日期。地铁票价须大于 0，金额保留至分。';
  if (!transferModes.includes(settings.outbound) || !transferModes.includes(settings.inbound)) return '请选择有效的公交换乘方向。';
  if (![30,31].includes(settings.validityDays)) return '请选择次卡有效期。';
  if (!['discount-first','transfer-first'].includes(settings.order)) return '请选择优惠计算顺序。';
  if (settings.activation && !/^\d{4}-\d{2}-\d{2}$/.test(settings.activation)) return '请填写有效的激活日期。';
  return '';
}
function renderResults() {
  const error = validate();
  $('error').textContent = error;
  $('error').hidden = !error;
  $('results').classList.toggle('invalid',Boolean(error));
  if (error) { $('mobileResult').textContent = '请检查通勤设置'; return; }
  const dates = selectedDates();
  comparison = compare(dates,settings,RULES.packs);
  const {results,best,trips} = comparison;
  const baseline = results[0];
  const saving = baseline.total - best.total;
  $('policyNotice').hidden = month >= '2026-12';
  $('policyNotice').textContent = '所选月份早于新规则生效日。当前展示按 2026 年 12 月新规则的模拟价格，请用于方案试算。';
  $('bestName').textContent = trips.length ? (best.pack ? `${best.pack.rides} 次卡${best.ordinary ? ' + 普通支付' : ''}` : '直接普通支付') : '先选几天出发吧';
  $('bestTotal').textContent = money(best.total);
  $('bestSaving').textContent = saving > 0 ? `比全部普通支付省 ${money(saving)}` : '当前方案中花费最低';
  $('tripSummary').textContent = `${dates.length} 个通勤日 · ${trips.length} 次地铁`;
  let description = trips.length ? `所选 ${dates.length} 天共 ${trips.length} 程。` : '点击日历中的日期，即可开始比较。';
  if (trips.length && best.pack) {
    description += `使用次卡 ${best.used} 次`;
    if (best.ordinary) description += `，普通支付 ${best.ordinary} 次`;
    description += `，次卡剩余 ${best.unused} 次。`;
  }
  if (trips.length && !best.pack) {
    description += baseline.reached ? `${baseline.reached.slice(5)} 达到满额，后续地铁享九折。` : settings.prior >= settings.threshold ? '已达到满额，所选行程的地铁票价享九折。' : '本月累计尚未达到满额优惠门槛。';
  }
  $('bestDescription').textContent = description;
  $('comparisonRows').innerHTML = results.map(result => {
    const diff = baseline.total - result.total;
    const isBest = result.total === best.total;
    return `<tr class="${isBest ? 'winning' : ''}"><td>${planName(result)}${isBest ? '<span class="winner-label">最低</span>' : ''}<small>${result.pack ? `一张 ${money(result.purchase)}` : '换乘 + 满额优惠'}</small></td><td>${money(result.purchase)}</td><td>${money(result.metro)}</td><td>${money(result.bus)}</td><td>${money(result.total)}</td><td class="${diff > 0 ? 'saving' : ''}">${diff > 0 ? '省 ' + money(diff) : diff < 0 ? '多 ' + money(-diff) : '—'}</td><td>${result.pack ? `${result.used} 次 / 余 ${result.unused} 次` : '—'}</td></tr>`;
  }).join('');
  $('mobilePlans').innerHTML = results.map(result => {
    const diff = baseline.total - result.total;
    const isBest = result.total === best.total;
    return `<article class="mobile-plan ${isBest ? 'best' : ''}"><div class="plan-top"><h3>${planName(result)}${isBest ? '<span class="winner-label">最低</span>' : ''}</h3><strong>${money(result.total)}</strong></div><div class="plan-breakdown"><span>购卡 <b>${money(result.purchase)}</b></span><span>普通地铁 <b>${money(result.metro)}</b></span><span>公交 <b>${money(result.bus)}</b></span></div><div class="plan-foot"><span>${result.pack ? `用 ${result.used} 次 · 余 ${result.unused} 次` : '本月普通支付总价'}</span><span class="${diff > 0 ? 'saving' : ''}">${diff > 0 ? '省 ' + money(diff) : diff < 0 ? '多 ' + money(-diff) : '对比基准'}</span></div></article>`;
  }).join('');
  const oldIndex = detailIndex;
  $('detailPlan').innerHTML = results.map((result,index) => `<option value="${index}">${planName(result)}</option>`).join('');
  detailIndex = oldIndex ?? results.indexOf(best);
  $('detailPlan').value = detailIndex;
  renderDaily();
  $('mobileResult').innerHTML = `本月最低 <strong>${money(best.total)}</strong> · 查看对比`;
  $('results').setAttribute('aria-busy','false');
}
function renderDaily() {
  const result = comparison.results[detailIndex];
  $('dailyRows').innerHTML = result.rows.length ? result.rows.map(row => `<tr><td>${row.date.slice(5)} ${row.leg}</td><td>${row.card ? '次卡' : row.discounted ? '普通支付 · 九折' : '普通支付'}</td><td>${money(row.metro)}</td><td>${money(row.bus)}</td><td>${money(row.accumulated)}</td></tr>`).join('') : '<tr><td colspan="5">尚未选择通勤日期</td></tr>';
}
let calculationTimer;
function refresh() {
  clearTimeout(calculationTimer);
  renderCalendar();
  persist();
  $('results').setAttribute('aria-busy','true');
  calculationTimer = setTimeout(renderResults,50);
}
$('settingsForm').addEventListener('submit',event => event.preventDefault());
$('settingsForm').addEventListener('input',event => {
  const {id,value,type,checked} = event.target;
  if (!(id in defaults)) return;
  settings[id] = type === 'checkbox' ? checked : numericFields.includes(id) ? Number(value) : value;
  updateVisibility();
  refresh();
});
document.querySelectorAll('[data-round]').forEach(button => button.addEventListener('click',() => {
  settings.roundTrip = button.dataset.round === 'true'; updateVisibility(); refresh();
}));
$('calendar').addEventListener('click',event => {
  const button = event.target.closest('[data-date]');
  if (!button) return;
  const date = button.dataset.date;
  const selected = new Set(selectedDates());
  if (selected.has(date)) selected.delete(date); else selected.add(date);
  calendars[month] = [...selected].sort();
  refresh();
  $('calendar').querySelector(`[data-date="${date}"]`).focus({preventScroll:true});
});
function changeMonth(value) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(value) || value < '2026-01' || value > '2099-12') return;
  month = value; $('month').value = value; refresh();
}
$('month').addEventListener('change',event => changeMonth(event.target.value));
function stepMonth(step) {
  const [year,m] = month.split('-').map(Number);
  const next = new Date(year,m-1+step,1);
  changeMonth(`${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}`);
}
$('prevMonth').addEventListener('click',() => stepMonth(-1));
$('nextMonth').addEventListener('click',() => stepMonth(1));
$('workdays').addEventListener('click',() => { calendars[month] = monthDays(month).filter(date => dayInfo(date).selected); refresh(); });
$('clearDays').addEventListener('click',() => { calendars[month] = []; refresh(); });
$('detailPlan').addEventListener('change',event => { detailIndex = Number(event.target.value); renderDaily(); });
renderSettings();
refresh();
