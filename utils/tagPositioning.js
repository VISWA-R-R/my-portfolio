/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Checks whether two 2D bounding boxes overlap with optional padding.
 */
export function rectsOverlap(a, b, pad = 4) {
  return (
    a.left < b.right + pad &&
    a.right > b.left - pad &&
    a.top < b.bottom + pad &&
    a.bottom > b.top - pad
  );
}

/**
 * Computes safe boundaries and positioned coordinates for a building tag,
 * keeping it strictly inside the visible screen and avoiding clipping or overlapping
 * controls and panels.
 */
export function computeTagLayout({
  screenX,
  screenY,
  distance,
  tagWidth,
  tagHeight,
  viewportWidth,
  viewportHeight,
  obstacles = [],
  placedTags = [],
  isMobile = false,
  margin = isMobile ? 8 : 12,
}) {
  if (!viewportWidth || !viewportHeight || tagWidth <= 0 || tagHeight <= 0) {
    return { visible: false };
  }

  // Determine boundary constraints from full-height docking obstacles (e.g. open sidebar or info panel)
  let safeMinX = margin;
  let safeMaxX = viewportWidth - margin;
  let safeMinY = margin;
  let safeMaxY = viewportHeight - margin;

  const interiorObstacles = [];

  for (const box of obstacles) {
    if (!box || box.width <= 0 || box.height <= 0) continue;
    // Sidebar docked or floating near left edge
    if (box.left <= 32 && box.width >= 100 && box.height > viewportHeight * 0.4) {
      safeMinX = Math.max(safeMinX, box.right + margin);
    }
    // Info panel docked or floating near right edge
    else if (box.right >= viewportWidth - 32 && box.width >= 150 && box.height > viewportHeight * 0.4) {
      safeMaxX = Math.min(safeMaxX, box.left - margin);
    }
    // Mobile bottom controls
    else if (box.bottom >= viewportHeight - 16 && box.height >= 70 && box.width > viewportWidth * 0.5) {
      safeMaxY = Math.min(safeMaxY, box.top - margin);
    } else {
      interiorObstacles.push(box);
    }
  }

  // If safe horizontal area is too narrow to fit the tag, shrink or clamp gently
  if (safeMaxX - safeMinX < tagWidth) {
    safeMinX = margin;
    safeMaxX = viewportWidth - margin;
  }

  // Initial anchor position: above building roof
  let cx = Math.max(safeMinX + tagWidth / 2, Math.min(safeMaxX - tagWidth / 2, screenX));
  let cy = Math.max(safeMinY + tagHeight, Math.min(safeMaxY, screenY));

  // If projected point is too close to top edge, flip or nudge below roof
  let isFlipped = false;
  if (screenY - tagHeight < safeMinY) {
    // Top clipping detected: position below building roof or clamp to top safe margin
    if (screenY + tagHeight + 8 <= safeMaxY) {
      cy = screenY + tagHeight + 8;
      isFlipped = true;
    } else {
      cy = safeMinY + tagHeight;
    }
  }

  let rect = {
    left: cx - tagWidth / 2,
    right: cx + tagWidth / 2,
    top: cy - tagHeight,
    bottom: cy,
    cx,
    cy,
  };

  // Check collision with interior obstacles (e.g. minimap, mission-hud, menu-toggle)
  const hitsObstacle = (r) => interiorObstacles.some((box) => rectsOverlap(r, box, 6));

  if (hitsObstacle(rect)) {
    // Try candidate adjustments in order of preference
    const candidates = [
      // Shift left of obstacle
      ...interiorObstacles.map((box) => ({
        cx: box.left - tagWidth / 2 - 8,
        cy: cy,
      })),
      // Shift right of obstacle
      ...interiorObstacles.map((box) => ({
        cx: box.right + tagWidth / 2 + 8,
        cy: cy,
      })),
      // Shift below obstacle
      ...interiorObstacles.map((box) => ({
        cx: cx,
        cy: box.bottom + tagHeight + 8,
      })),
      // Shift above obstacle
      ...interiorObstacles.map((box) => ({
        cx: cx,
        cy: box.top - 8,
      })),
    ];

    let bestCandidate = null;
    let minDisplacement = Infinity;

    for (const cand of candidates) {
      // Must stay within safe boundaries
      if (
        cand.cx - tagWidth / 2 < safeMinX ||
        cand.cx + tagWidth / 2 > safeMaxX ||
        cand.cy - tagHeight < safeMinY ||
        cand.cy > safeMaxY
      ) {
        continue;
      }

      const testRect = {
        left: cand.cx - tagWidth / 2,
        right: cand.cx + tagWidth / 2,
        top: cand.cy - tagHeight,
        bottom: cand.cy,
        cx: cand.cx,
        cy: cand.cy,
      };

      if (!hitsObstacle(testRect)) {
        const dist = Math.hypot(cand.cx - screenX, cand.cy - screenY);
        // Only accept if displacement is reasonable (keeps it anchored near building)
        const maxOffset = isMobile ? 140 : 200;
        if (dist < maxOffset && dist < minDisplacement) {
          minDisplacement = dist;
          bestCandidate = cand;
        }
      }
    }

    if (bestCandidate) {
      cx = bestCandidate.cx;
      cy = bestCandidate.cy;
      rect = {
        left: cx - tagWidth / 2,
        right: cx + tagWidth / 2,
        top: cy - tagHeight,
        bottom: cy,
        cx,
        cy,
      };
    }
  }

  // Check collision with already placed tags (nearer tags take precedence)
  const overlapsTag = (r) => placedTags.some((other) => rectsOverlap(r, other, 4));

  if (overlapsTag(rect)) {
    // Try stacking slightly above or below the conflicting tag
    const tagCandidates = [
      ...placedTags.map((t) => ({ cx, cy: t.top - 6 })),
      ...placedTags.map((t) => ({ cx, cy: t.bottom + tagHeight + 6 })),
      ...placedTags.map((t) => ({ cx: t.left - tagWidth / 2 - 6, cy })),
      ...placedTags.map((t) => ({ cx: t.right + tagWidth / 2 + 6, cy })),
    ];

    let foundNonOverlapping = false;
    for (const cand of tagCandidates) {
      if (
        cand.cx - tagWidth / 2 >= safeMinX &&
        cand.cx + tagWidth / 2 <= safeMaxX &&
        cand.cy - tagHeight >= safeMinY &&
        cand.cy <= safeMaxY
      ) {
        const testRect = {
          left: cand.cx - tagWidth / 2,
          right: cand.cx + tagWidth / 2,
          top: cand.cy - tagHeight,
          bottom: cand.cy,
          cx: cand.cx,
          cy: cand.cy,
        };

        if (!hitsObstacle(testRect) && !overlapsTag(testRect)) {
          const dist = Math.hypot(cand.cx - screenX, cand.cy - screenY);
          if (dist < (isMobile ? 120 : 180)) {
            cx = cand.cx;
            cy = cand.cy;
            rect = testRect;
            foundNonOverlapping = true;
            break;
          }
        }
      }
    }

    if (!foundNonOverlapping) {
      // If unable to place without severe occlusion, hide this tag
      return { visible: false };
    }
  }

  // Proximity to edges triggers compact layout for crispness
  const isEdge =
    rect.left <= safeMinX + 16 ||
    rect.right >= safeMaxX - 16 ||
    rect.top <= safeMinY + 16 ||
    rect.bottom >= safeMaxY - 16;

  const isCompact = isMobile || isEdge;

  // Stable, bounded distance scaling: stays readable and proportionate across all camera positions
  // Keeps labels consistently readable without ballooning over distant buildings or pulsing (range: 0.82 to 1.0)
  const scale = Math.max(0.82, Math.min(1.0, 1.0 - Math.max(0, distance - 12) * 0.0055));

  // Opacity calculation based on distance: clear up close, gracefully fading toward the 52m view distance limit
  const opacity = Math.max(0.4, Math.min(1, (54 - distance) / 14));

  return {
    visible: true,
    rect,
    cx,
    cy,
    scale,
    isCompact,
    isFlipped,
    opacity,
    transform: `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0) translate(-50%, -100%) scale(${scale.toFixed(3)})`,
  };
}
