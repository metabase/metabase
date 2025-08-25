import type { DatabaseProvider } from "metabase-types/api";

export const providerConfig = [
  {
    name: "Aiven",
    pattern: "\\.aivencloud\\.com$",
  },
  {
    name: "Amazon RDS",
    pattern: "\\.rds\\.amazonaws\\.com$",
  },
  {
    name: "Azure",
    pattern: "\\.postgres\\.database\\.azure\\.com$",
  },
  {
    name: "Crunchy Data",
    pattern: "\\.db\\.postgresbridge\\.com$",
  },
  {
    name: "DigitalOcean",
    pattern: "db\\.ondigitalocean\\.com$",
  },
  {
    name: "Fly.io",
    pattern: "\\.fly\\.dev$",
  },
  {
    name: "Neon",
    pattern: "\\.neon\\.tech$",
  },
  {
    name: "PlanetScale",
    pattern: "\\.psdb\\.cloud$",
  },
  {
    name: "Railway",
    pattern: "\\.railway\\.app$",
  },
  {
    name: "Render",
    pattern: "\\.render\\.com$",
  },
  {
    name: "Scaleway",
    pattern: "\\.scw\\.cloud$",
  },
  {
    name: "Supabase",
    pattern: "pooler\\.supabase\\.com|\\.supabase\\.co$",
  },
  {
    name: "Timescale",
    pattern: "\\.tsdb\\.cloud|\\.timescale\\.com$",
  },
] satisfies DatabaseProvider[];
