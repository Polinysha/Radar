// Проверка правил «Радара новичков». Запуск: node test/rules.test.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.match(/<script id="core">([\s\S]*?)<\/script>/)[1];
const Core = new Function('module', src + '; return Core;')(undefined);

let n = 0;
function test(name, fn) { fn(); n++; console.log('ok  ' + name); }

const person = (day, steps) => ({ id: 'x', name: 'Тестов Тест', role: 'Кассир', unit: 'sh-1', unitName: 'Магазин', dept: 'Магазины', manager: 'Рук', day, steps });
const step = (key, due, kind, extra) => Object.assign({ key, due, kind, who: 'Руководитель', title: key, doneDay: null, outcome: null, note: '', ask: ['?'] }, extra);

test('статус шага: сделан, сорван, сегодня, впереди', () => {
  assert.strictEqual(Core.stepStatus(step('a', 3, 'talk', { doneDay: 3 }), 10), 'done');
  assert.strictEqual(Core.stepStatus(step('a', 3, 'talk'), 4), 'overdue');
  assert.strictEqual(Core.stepStatus(step('a', 3, 'talk'), 3), 'today');
  assert.strictEqual(Core.stepStatus(step('a', 3, 'talk'), 2), 'future');
});

test('из нескольких пропущенных разговоров в список идёт только последний', () => {
  const p = person(20, [step('a', 3, 'talk'), step('b', 14, 'talk'), step('c', 2, 'train')]);
  assert.strictEqual(Core.stepStatus(p.steps[0], p.day, p.steps), 'skipped');
  assert.deepStrictEqual(Core.summarize(p).overdue.map(s => s.key), ['b', 'c']);
  const q = person(10, [step('a', 3, 'talk'), step('b', 14, 'talk')]);
  assert.strictEqual(Core.stepStatus(q.steps[0], q.day, q.steps), 'overdue');
});

test('новичок без сорванных шагов и сигналов не требует внимания', () => {
  const s = Core.summarize(person(5, [step('a', 3, 'talk', { doneDay: 3, outcome: 'ok' }), step('b', 14, 'talk')]));
  assert.strictEqual(s.level, 'ok');
  assert.strictEqual(s.attention, false);
  assert.strictEqual(s.next.key, 'b');
});

test('сорванный шаг поднимает до красного, шаг сегодня до жёлтого', () => {
  assert.strictEqual(Core.summarize(person(5, [step('a', 3, 'talk')])).level, 'red');
  assert.strictEqual(Core.summarize(person(3, [step('a', 3, 'talk')])).level, 'amber');
});

test('учитывается итог только последнего разговора', () => {
  const old = step('a', 3, 'talk', { doneDay: 3, outcome: 'leave' });
  const fresh = step('b', 14, 'talk', { doneDay: 14, outcome: 'ok' });
  assert.strictEqual(Core.summarize(person(20, [old, fresh])).flag, null);
  fresh.outcome = 'leave';
  assert.strictEqual(Core.summarize(person(20, [old, fresh])).level, 'leave');
});

test('сортировка: уход, затем больше сорванных, затем кто работает меньше', () => {
  const a = Object.assign(person(40, [step('a', 3, 'talk')]), { id: 'a' });
  const b = Object.assign(person(20, [step('a', 3, 'train'), step('b', 14, 'talk')]), { id: 'b' });
  const c = Object.assign(person(50, [step('a', 3, 'talk', { doneDay: 3, outcome: 'leave' })]), { id: 'c' });
  const d = Object.assign(person(10, [step('a', 3, 'talk')]), { id: 'd' });
  const e = Object.assign(person(2, [step('a', 3, 'talk')]), { id: 'e' });
  assert.deepStrictEqual(Core.rank([a, b, c, d, e]).map(x => x.p.id), ['c', 'b', 'd', 'a', 'e']);
});

test('отметка о выполнении убирает шаг из сорванных и не меняет исходные данные', () => {
  const base = [person(5, [step('a', 3, 'talk')])];
  const after = Core.applyOverrides(base, { x: { a: { doneDay: 5, outcome: 'ok', note: '' } } });
  assert.strictEqual(Core.summarize(after[0]).level, 'ok');
  assert.strictEqual(base[0].steps[0].doneDay, null);
});

test('демо-набор: 27 человек, все внутри 90 дней, воспроизводим', () => {
  const p1 = Core.buildDemo(), p2 = Core.buildDemo();
  assert.strictEqual(p1.length, 27);
  assert.deepStrictEqual(p1, p2);
  p1.forEach(p => {
    assert.ok(p.day >= 1 && p.day <= Core.PROBATION);
    p.steps.forEach(s => { if (s.doneDay != null) assert.ok(s.doneDay <= p.day, 'шаг не может быть сделан в будущем'); });
    assert.deepStrictEqual(p.steps.map(s => s.due), p.steps.map(s => s.due).slice().sort((a, b) => a - b));
  });
  assert.strictEqual(new Set(p1.map(p => p.id)).size, 27);
  assert.strictEqual(p1.filter(p => Core.summarize(p).flag === 'leave').length, 1);
});

test('статистика по подразделениям сходится со списком', () => {
  const people = Core.buildDemo();
  const stats = Core.unitStats(people);
  const overdue = people.reduce((a, p) => a + Core.summarize(p).overdue.length, 0);
  assert.strictEqual(stats.reduce((a, u) => a + u.overdue, 0), overdue);
  assert.strictEqual(stats.reduce((a, u) => a + u.people, 0), people.length);
  stats.forEach(u => assert.ok(u.onTime <= u.due));
});

test('склонение и текст задачи', () => {
  assert.deepStrictEqual([1, 2, 5, 11, 21, 22].map(x => Core.plural(x, 'день', 'дня', 'дней')), ['день', 'дня', 'дней', 'дней', 'день', 'дня']);
  const p = person(7, [step('talk3', 3, 'talk', { title: 'Разговор на третий день' })]);
  const t = Core.taskText(p, p.steps[0]);
  assert.ok(t.includes('просрочено на 4 дня'));
  assert.ok(t.includes('7-й день из 90'));
  assert.ok(t.includes('Кто делает: Рук'));
});

console.log('\nПройдено проверок: ' + n);
