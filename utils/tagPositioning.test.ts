import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTagLayout, rectsOverlap } from './tagPositioning.js';

test('rectsOverlap detects collisions correctly', () => {
  const a = { left: 10, right: 100, top: 10, bottom: 40 };
  const b = { left: 90, right: 150, top: 20, bottom: 50 };
  const c = { left: 200, right: 300, top: 20, bottom: 50 };

  assert.equal(rectsOverlap(a, b, 4), true);
  assert.equal(rectsOverlap(a, c, 4), false);
});

test('clamps tag within visible screen when projected near top edge', () => {
  const result: any = computeTagLayout({
    screenX: 400,
    screenY: 10, // Very near top
    distance: 15,
    tagWidth: 120,
    tagHeight: 30,
    viewportWidth: 1440,
    viewportHeight: 900,
  });

  assert.equal(result.visible, true);
  // Must not clip top edge (top >= margin)
  assert.ok(result.rect && result.rect.top >= 12, `Top ${result.rect?.top} should be >= 12`);
  assert.ok(result.rect && result.rect.bottom <= 900 - 12);
});

test('clamps tag within visible screen when projected near left and right edges', () => {
  const leftNear: any = computeTagLayout({
    screenX: 5,
    screenY: 300,
    distance: 15,
    tagWidth: 140,
    tagHeight: 32,
    viewportWidth: 1440,
    viewportHeight: 900,
  });

  assert.equal(leftNear.visible, true);
  assert.ok(leftNear.rect && leftNear.rect.left >= 12, `Left ${leftNear.rect?.left} should be >= 12`);
  assert.equal(leftNear.isCompact, true);

  const rightNear: any = computeTagLayout({
    screenX: 1435,
    screenY: 300,
    distance: 15,
    tagWidth: 140,
    tagHeight: 32,
    viewportWidth: 1440,
    viewportHeight: 900,
  });

  assert.equal(rightNear.visible, true);
  assert.ok(rightNear.rect && rightNear.rect.right <= 1440 - 12, `Right ${rightNear.rect?.right} should be <= 1428`);
  assert.equal(rightNear.isCompact, true);
});

test('repositions tag to stay left of an open right info panel', () => {
  // Info panel occupies right 400px of screen: [1040, 1440]
  const panel = { left: 1040, right: 1440, top: 0, bottom: 900, width: 400, height: 900 };

  const result: any = computeTagLayout({
    screenX: 1100, // Projected building is behind or near panel
    screenY: 400,
    distance: 18,
    tagWidth: 130,
    tagHeight: 32,
    viewportWidth: 1440,
    viewportHeight: 900,
    obstacles: [panel] as any,
  });

  assert.equal(result.visible, true);
  // Tag must not overlap the panel!
  assert.ok(result.rect && result.rect.right <= panel.left - 12, `Tag right ${result.rect?.right} should stay left of panel ${panel.left}`);
});

test('repositions tag to stay right of an open left sidebar', () => {
  // Sidebar occupies left 320px: [0, 320]
  const sidebar = { left: 0, right: 320, top: 0, bottom: 900, width: 320, height: 900 };

  const result: any = computeTagLayout({
    screenX: 200,
    screenY: 350,
    distance: 18,
    tagWidth: 120,
    tagHeight: 30,
    viewportWidth: 1440,
    viewportHeight: 900,
    obstacles: [sidebar] as any,
  });

  assert.equal(result.visible, true);
  assert.ok(result.rect && result.rect.left >= sidebar.right + 12, `Tag left ${result.rect?.left} should stay right of sidebar ${sidebar.right}`);
});

test('avoids overlapping an already placed nearer tag', () => {
  const firstTag = {
    left: 450,
    right: 570,
    top: 270,
    bottom: 300,
    cx: 510,
    cy: 300,
  };

  const secondTag: any = computeTagLayout({
    screenX: 510, // Same anchor point!
    screenY: 300,
    distance: 25, // Farther away
    tagWidth: 120,
    tagHeight: 30,
    viewportWidth: 1440,
    viewportHeight: 900,
    placedTags: [firstTag] as any,
  });

  assert.equal(secondTag.visible, true);
  assert.equal(rectsOverlap(secondTag.rect, firstTag, 2), false, 'Second tag should not collide with first tag');
});
