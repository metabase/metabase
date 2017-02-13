/* @flow weak */

import L from "leaflet/dist/leaflet-src.js";
import d3 from "d3";

export function computeMinimalBounds(features) {
    const points = getAllFeaturesPoints(features);
    const gap = computeLargestGap(points, (d) => d[0]);
    const [west, east] = d3.extent(points, (d) => d[0]);
    const [north, south] = d3.extent(points, (d) => d[1]);

    const normalGapSize = gap[1] - gap[0];
    const antemeridianGapSize = (180 + west) + (180 - east);

    if (antemeridianGapSize > normalGapSize) {
        return L.latLngBounds(
            L.latLng(south, west), // SW
            L.latLng(north, east)  // NE
        )
    } else {
        return L.latLngBounds(
            L.latLng(south, -360 + gap[1]), // SW
            L.latLng(north, gap[0])  // NE
        )
    }
}

export function computeLargestGap(items, valueAccessor = (d) => d) {
    const [xMin, xMax] = d3.extent(items, valueAccessor);
    if (xMin === xMax) {
        return [xMin, xMax];
    }

    const buckets = [];
    const bucketSize = (xMax - xMin) / items.length;
    for (const item of items) {
        const x = valueAccessor(item);
        const k = Math.floor((x - xMin) / bucketSize);
        if (buckets[k] === undefined) {
            buckets[k] = [x, x];
        } else {
            buckets[k] = [Math.min(x, buckets[k][0]), Math.max(x, buckets[k][1])];
        }
    }
    let largestGap = [0, 0];
    for (let i = 0; i < items.length; i++) {
        if (buckets[i + 1] === undefined) {
            buckets[i + 1] = buckets[i];
        } else if (buckets[i + 1][0] - buckets[i][1] > largestGap[1] - largestGap[0]) {
            largestGap = [buckets[i][1], buckets[i + 1][0]];
        }
    }
    return largestGap;
}

export function getAllFeaturesPoints(features) {
    let points = [];
    for (let feature of features) {
        if (feature.geometry.type === "Polygon") {
            for (let coordinates of feature.geometry.coordinates) {
                points = points.concat(coordinates);
            }
        } else if (feature.geometry.type === "MultiPolygon") {
            for (let coordinatesList of feature.geometry.coordinates) {
                for (let coordinates of coordinatesList) {
                    points = points.concat(coordinates);
                }
            }
        } else {
            console.warn("Unimplemented feature.geometry.type", feature.geometry.type)
        }
    }
    return points;
}
