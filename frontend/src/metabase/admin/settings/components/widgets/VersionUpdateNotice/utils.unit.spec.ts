import { dayjs } from "metabase/dayjs";

import {
  getEolMessage,
  getEolReachedMessage,
  getVersionMessage,
} from "./utils";

const CURRENT = "v1.53.8";
const LATEST = "v1.53.9";
const EOL_DATE = new Date("2099-06-01");

describe("getVersionMessage", () => {
  it("says the current version is the latest", () => {
    expect(getVersionMessage(LATEST, LATEST, false)).toBe(
      "You're running Metabase 1.53.9, which is the latest and greatest.",
    );
  });

  it("says a new version is available", () => {
    expect(getVersionMessage(CURRENT, LATEST, false)).toBe(
      "Metabase 1.53.9 is available. You're running 1.53.8.",
    );
  });

  it("says the current version has reached end-of-life when a new version is available", () => {
    expect(getVersionMessage(CURRENT, LATEST, true)).toBe(
      "Metabase 1.53.9 is available. You're running 1.53.8, which has reached end-of-life.",
    );
  });

  it("falls back when version data is not comparable", () => {
    expect(getVersionMessage("notaversion", LATEST, false)).toBe(
      "You're running Metabase notaversion.",
    );
  });
});

describe("getEolMessage", () => {
  it("uses the reached-eol copy after end-of-life", () => {
    expect(getEolMessage(CURRENT, EOL_DATE, true)).toBe(getEolReachedMessage());
  });

  it("includes the formatted date before end-of-life", () => {
    expect(getEolMessage(CURRENT, EOL_DATE, false)).toBe(
      `Metabase 53 will reach end-of-life on ${dayjs(EOL_DATE).utc().format("LL")} and will receive bug and security fixes until then.`,
    );
  });
});
