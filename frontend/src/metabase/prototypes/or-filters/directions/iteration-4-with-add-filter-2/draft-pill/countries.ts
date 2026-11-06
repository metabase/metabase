import { t } from "ttag";

// Prototype: continents for the country filter presets, by ISO 3166-1 alpha-2
// code. Countries that span two continents are in one of them.
const CONTINENT_CODES = {
  asia: "AF AM AZ BH BD BT BN KH CN CY GE HK IN ID IR IQ IL JP JO KZ KW KG LA LB MO MY MV MN MM NP KP OM PK PS PH QA SA SG KR LK SY TW TJ TH TL TR TM AE UZ VN YE",
  europe:
    "AL AD AT BY BE BA BG HR CZ DK EE FO FI FR DE GI GR GG HU IS IE IM IT JE XK LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SE CH UA GB VA AX SJ",
  northAmerica:
    "AG BS BB BZ CA CR CU DM DO SV GD GT HT HN JM MX NI PA KN LC VC TT US AI AW BM BQ VG KY CW GL GP MQ MS PR BL MF PM SX TC VI",
  southAmerica: "AR BO BR CL CO EC FK GF GY PY PE SR UY VE",
  africa:
    "DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU YT MA MZ NA NE NG RE RW SH ST SN SC SL SO ZA SS SD TZ TG TN UG EH ZM ZW",
  oceania:
    "AS AU CK FJ PF GU KI MH FM NR NC NZ NU NF MP PW PG PN WS SB TK TO TV VU WF",
};

type Continent = keyof typeof CONTINENT_CODES;

const CONTINENT_ORDER: Continent[] = [
  "asia",
  "europe",
  "northAmerica",
  "southAmerica",
  "africa",
  "oceania",
];

const CONTINENT_BY_CODE = new Map<string, Continent>(
  CONTINENT_ORDER.flatMap((continent) =>
    CONTINENT_CODES[continent]
      .split(" ")
      .map((code): [string, Continent] => [code, continent]),
  ),
);

function getContinentName(continent: Continent) {
  switch (continent) {
    case "asia":
      return t`Asia`;
    case "europe":
      return t`Europe`;
    case "northAmerica":
      return t`North America`;
    case "southAmerica":
      return t`South America`;
    case "africa":
      return t`Africa`;
    case "oceania":
      return t`Oceania`;
  }
}

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

/** English name of a two-letter country code, or null when it is unknown. */
export function getCountryName(value: string): string | null {
  if (!/^[a-z]{2}$/i.test(value)) {
    return null;
  }
  const code = value.toUpperCase();
  try {
    const name = regionNames.of(code);
    return name != null && name !== code ? name : null;
  } catch {
    return null;
  }
}

export function getFlagUrl(value: string) {
  return `https://flagcdn.com/w40/${value.toLowerCase()}.png`;
}

export interface ContinentPreset {
  name: string;
  values: string[];
}

/** Continents that have at least one of the values, with these values. */
export function getContinentPresets(values: string[]): ContinentPreset[] {
  return CONTINENT_ORDER.map((continent) => ({
    name: getContinentName(continent),
    values: values.filter(
      (value) => CONTINENT_BY_CODE.get(value.toUpperCase()) === continent,
    ),
  })).filter((preset) => preset.values.length > 0);
}
