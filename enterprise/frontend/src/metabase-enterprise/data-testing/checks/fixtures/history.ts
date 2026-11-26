import type { DataCheckHistoryPoint } from "../components/views";

const ROW_COUNTS = [
  412, 398, 431, 440, 287, 265, 405, 419, 402, 436, 447, 291, 270, 409, 423,
  411, 428, 452, 296, 281, 414, 420, 131,
];

export const HAND_WRITTEN_VOLUME_HISTORY: DataCheckHistoryPoint[] =
  ROW_COUNTS.map((value, index) => {
    const isWeekend = index % 7 === 4 || index % 7 === 5;
    const day = String(index + 1).padStart(2, "0");
    return {
      label: `2026-11-${day}`,
      value,
      min: isWeekend ? 230 : 370,
      max: isWeekend ? 330 : 480,
    };
  });
