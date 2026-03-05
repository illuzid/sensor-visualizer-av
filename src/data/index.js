/**
 * Sensor Database Module
 * ======================
 * Single source of truth for all sensor and mount data.
 *
 * To add a sensor:
 *   1. Open sensors.json
 *   2. Find the correct group in "groups"
 *   3. Append a new object to its "sensors" array:
 *      {
 *        "id":     "fxo_999",           // unique, prefix with group id
 *        "name":   "FXO 999 · 50MP",    // short display name
 *        "format": "1.2\"",             // industry format label
 *        "w":      14.60,               // width  in mm  (pitch_µm × h_px / 1000)
 *        "h":      12.63,               // height in mm  (pitch_µm × v_px / 1000)
 *        "mp":     50,                  // megapixels
 *        "note":   "IMX999 · 2.74µm · 5328×4608 · C-mount · 100GigE"
 *      }
 *
 * To add a group:
 *   1. Open sensors.json
 *   2. Append a new object to "groups":
 *      {
 *        "id":      "mygroup",
 *        "label":   "My Camera Series",
 *        "color":   "#c0392b",
 *        "sensors": [ ... ]
 *      }
 *
 * To add a mount:
 *   1. Open mounts.json
 *   2. Append a new object to "mounts":
 *      {
 *        "id":            "M100",
 *        "name":          "M100×1",
 *        "type":          "MV",    // "MV" or "Photo"
 *        "imageDiameter": 90.0,
 *        "notes":         "⌀90mm · ultra-large format"
 *      }
 */

import rawSensorData from "./sensors.json";
import rawMountData  from "./mounts.json";

// ─── Sensor Groups ─────────────────────────────────────────────────────────────
// Strip internal _comment keys that are only for human editors.
function stripComments(obj) {
  if (Array.isArray(obj)) return obj.map(stripComments);
  if (obj && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([k]) => k !== "_comment" && k !== "_schema")
        .map(([k, v]) => [k, stripComments(v)])
    );
  }
  return obj;
}

/** @type {Array<{id: string, label: string, color: string, sensors: object[]}>} */
export const SENSOR_GROUPS = stripComments(rawSensorData).groups;

/**
 * Flat sensor array enriched with groupId and groupColor.
 * Use this for lookups, filtering, and sorting.
 * @type {Array<object>}
 */
export const SENSOR_DB = SENSOR_GROUPS.flatMap(g =>
  g.sensors.map(s => ({ ...s, groupId: g.id, groupColor: g.color }))
);

// ─── Mount Database ────────────────────────────────────────────────────────────
/** @type {Array<{id: string, name: string, type: string, imageDiameter: number, notes: string}>} */
export const MOUNT_DB = stripComments(rawMountData).mounts;

// ─── Helper functions ──────────────────────────────────────────────────────────

/** Return a single sensor by id, or undefined if not found. */
export function getSensorById(id) {
  return SENSOR_DB.find(s => s.id === id);
}

/** Return all sensors belonging to a group. */
export function getSensorsByGroup(groupId) {
  return SENSOR_DB.filter(s => s.groupId === groupId);
}

/** Return a single mount by id, or undefined if not found. */
export function getMountById(id) {
  return MOUNT_DB.find(m => m.id === id);
}

/** Return all mounts of a given type ("MV" or "Photo"). */
export function getMountsByType(type) {
  return MOUNT_DB.filter(m => m.type === type);
}

/**
 * Compute the diagonal of a sensor in mm.
 * @param {{w: number, h: number}} sensor
 */
export function sensorDiagonal(sensor) {
  return Math.sqrt(sensor.w ** 2 + sensor.h ** 2);
}
