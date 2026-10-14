const assert = require('node:assert/strict');
const R = require('../src/editor-rules.js');
// 来自源码的关键边界；避免>=和>写错。
for (const [value, level, bars] of [[0,'low',0],[1,'low',2],[100,'low',2],[101,'medium',3],[1000,'medium',3],[1001,'high',5]]) assert.deepEqual(R.volume(value), {level,bars});
for (const [value, level] of [[0,'low'],[29.6,'low'],[30,'medium'],[59.6,'medium'],[60,'high'],[100,'high']]) assert.equal(R.visibility(value).level, level);
for (const [value, color] of [[39,'#F53F3F'],[40,'#FF7D00'],[59.9,'#FF7D00'],[60,'#165DFF'],[79.9,'#165DFF'],[80,'#00B42A']]) assert.equal(R.score(value).fg, color);
assert.equal(R.score(50, true).fg, '#F53F3F');
assert.equal(R.round(6.85, 1), 6.9);
assert.equal(R.relative(1, 1, 1).percent, 0);
assert.equal(R.relative(67, 0, 100).level, 'excellent');
assert.deepEqual(R.widths([20,60,20,0]), [33.33,100,33.33,0]);
const redistributed = R.redistribute([20,30,50], 0, 40);
assert.deepEqual(redistributed, [40,22.5,37.5]);
assert.equal(R.redistribute([0,0,0], 0, 20).reduce((a,b)=>a+b,0), 100);
assert.deepEqual(R.normalize([2,3,5]), [20,30,50]);
assert.equal(R.rate(3,1), 75);
assert.equal(R.rate(0,0), 0);
console.log('规则验证通过：搜索量、可见度、评分、相对水平、比例重算、舍入及空数据边界。');
