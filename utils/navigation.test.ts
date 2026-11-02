import test from 'node:test';
import assert from 'node:assert/strict';
import { cityPlaces, residentialPlaces } from '../cityData.js';
import { planRoute, tourStops, placeByLabel, roadLines, vehicleRadius } from '../navigation.js';

test('all 10 auto tour legs connect cleanly without blocked segments', () => {
  for (let i = 0; i < tourStops.length; i++) {
    const fromLabel = tourStops[i];
    const toLabel = tourStops[(i + 1) % tourStops.length];
    const from = placeByLabel(fromLabel);
    const to = placeByLabel(toLabel);
    assert.ok(from, `Source stop ${fromLabel} must exist`);
    assert.ok(to, `Target stop ${toLabel} must exist`);

    const fromPos = from.interactionPosition ?? from.position;
    const toPos = to.interactionPosition ?? to.position;

    const route = planRoute(fromPos[0], fromPos[2], toPos[0], toPos[2]);
    assert.ok(route, `Auto tour route from ${fromLabel} to ${toLabel} must be findable`);
    assert.ok(route.length >= 2, `Route from ${fromLabel} to ${toLabel} must have >= 2 points`);
  }
});

test('residential houses are properly positioned and clear of roads and intersections', () => {
  const carRadius = vehicleRadius('CAR');
  assert.ok(residentialPlaces.length >= 20, 'Should have rich clusters of residential homes');

  for (const home of residentialPlaces) {
    const [hx, , hz] = home.position;
    const halfW = home.width / 2;
    const halfD = home.depth / 2;

    // Check against every road centerline
    for (const r of roadLines) {
      const distToRoadX = Math.abs(hx - r);
      const distToRoadZ = Math.abs(hz - r);

      // If home is located within a block, its edges must not encroach onto the road lane
      if (distToRoadX < 5) {
        assert.ok(
          distToRoadX >= halfW + carRadius,
          `Home ${home.id} at x=${hx} is too close to road x=${r} (dist: ${distToRoadX}, required: ${halfW + carRadius})`
        );
      }
      if (distToRoadZ < 5) {
        assert.ok(
          distToRoadZ >= halfD + carRadius,
          `Home ${home.id} at z=${hz} is too close to road z=${r} (dist: ${distToRoadZ}, required: ${halfD + carRadius})`
        );
      }
    }
  }
});

test('residential houses do not collide with any portfolio destination building', () => {
  for (const home of residentialPlaces) {
    for (const place of cityPlaces) {
      const halfW = place.style === 'shop' ? 2.25 : 1.55;
      const halfD = place.style === 'shop' ? 1.9 : 1.55;
      const dx = Math.abs(home.position[0] - place.position[0]);
      const dz = Math.abs(home.position[2] - place.position[2]);
      const collides = dx < (halfW + home.width / 2) && dz < (halfD + home.depth / 2);
      assert.equal(collides, false, `Home ${home.id} must not collide with landmark ${place.label}`);
    }
  }
});

test('no residential houses collide with one another', () => {
  for (let i = 0; i < residentialPlaces.length; i++) {
    for (let j = i + 1; j < residentialPlaces.length; j++) {
      const a = residentialPlaces[i];
      const b = residentialPlaces[j];
      const dx = Math.abs(a.position[0] - b.position[0]);
      const dz = Math.abs(a.position[2] - b.position[2]);
      const minX = (a.width + b.width) / 2 + 0.2;
      const minZ = (a.depth + b.depth) / 2 + 0.2;
      const collides = dx < minX && dz < minZ;
      assert.equal(collides, false, `Homes ${a.id} and ${b.id} must not collide with each other`);
    }
  }
});
