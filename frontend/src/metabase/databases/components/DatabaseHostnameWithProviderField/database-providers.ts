const providerNames = [
  "Aiven",
  "Amazon RDS",
  "Supabase",
  "Azure",
  "Crunchy Data",
  "DigitalOcean",
  "Fly.io",
  "Neon",
  "PlanetScale",
  "Render",
  "Railway",
  "Scaleway",
  "Timescale",
] as const;

export type DatabaseProvider = {
  name: (typeof providerNames)[number];
  pattern: RegExp;
};

const PROVIDERS = [
  { name: "Aiven", pattern: /\.aivencloud\.com$/ },
  { name: "Amazon RDS", pattern: /\.rds\.amazonaws\.com$/ },
  { name: "Azure", pattern: /\.postgres\.database\.azure\.com$/ },
  {
    name: "Crunchy Data",
    pattern: /\.db\.postgresbridge\.com$/,
  },
  { name: "DigitalOcean", pattern: /db\.ondigitalocean\.com$/ },
  { name: "Fly.io", pattern: /\.fly\.dev$/ },
  { name: "Neon", pattern: /\.neon\.tech$/ },
  { name: "PlanetScale", pattern: /\.psdb\.cloud$/ },
  { name: "Railway", pattern: /\.railway\.app$/ },
  { name: "Render", pattern: /\.render\.com$/ },
  { name: "Scaleway", pattern: /\.scw\.cloud$/ },
  { name: "Supabase", pattern: /pooler\.supabase\.com|\.supabase\.co$/ },
  { name: "Timescale", pattern: /\.tsdb\.cloud|\.timescale\.com$/ },
] as const;

export type DatabaseProviderName = (typeof providerNames)[number];

export const detectDBProvider = (host: string): DatabaseProviderName | null => {
  if (!host) {
    return null;
  }
  const provider = PROVIDERS.find(({ pattern }) => pattern.test(host));
  return provider?.name || null;
};
