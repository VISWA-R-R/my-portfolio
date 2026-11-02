import test from 'node:test';
import assert from 'node:assert/strict';
import { validateContactInput, TARGET_PORTFOLIO_EMAIL } from './contactValidation.js';

test('validates correct portfolio target email', () => {
  assert.equal(TARGET_PORTFOLIO_EMAIL, 'viswaoff03@gmail.com');
});

test('validates valid contact submission', () => {
  const result = validateContactInput({
    name: 'Viswa R.R',
    email: 'viswakumar7771@gmail.com',
    message: 'Hello Viswa, I would like to discuss a job opportunity with you!',
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, {});
  assert.equal(result.cleanData?.name, 'Viswa R.R');
  assert.equal(result.cleanData?.email, 'viswakumar7771@gmail.com');
  assert.equal(result.cleanData?.message, 'Hello Viswa, I would like to discuss a job opportunity with you!');
});

test('rejects missing or too short fields', () => {
  const empty = validateContactInput({});
  assert.equal(empty.valid, false);
  assert.ok(empty.errors.name);
  assert.ok(empty.errors.email);
  assert.ok(empty.errors.message);

  const short = validateContactInput({
    name: 'A',
    email: 'bad-email',
    message: 'short',
  });
  assert.equal(short.valid, false);
  assert.ok(short.errors.name.includes('2 characters'));
  assert.ok(short.errors.email.includes('valid email'));
  assert.ok(short.errors.message.includes('10 characters'));
});

test('trims whitespace cleanly', () => {
  const result = validateContactInput({
    name: '  Viswa Kumar  ',
    email: '  test@example.com  ',
    message: '  This is a clean message test.  ',
  });
  assert.equal(result.valid, true);
  assert.equal(result.cleanData?.name, 'Viswa Kumar');
  assert.equal(result.cleanData?.email, 'test@example.com');
  assert.equal(result.cleanData?.message, 'This is a clean message test.');
});
