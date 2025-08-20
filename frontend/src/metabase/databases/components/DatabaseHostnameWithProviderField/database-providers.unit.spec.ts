import type {
  DatabaseProvider,
  DatabaseProviderName,
} from "metabase-types/api/settings";

import { detectDBProvider } from "./database-providers";

const config = [
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

const testCases: { host: string; provider: DatabaseProviderName }[] = [
  {
    host: "my-db.aivencloud.com",
    provider: "Aiven",
  },
  {
    host: "my-db.rds.amazonaws.com",
    provider: "Amazon RDS",
  },
  {
    host: "production-flexible-server.postgres.database.azure.com",
    provider: "Azure",
  },
  {
    host: "p.vbjrfujv5beutaoelw725gvi3i.db.postgresbridge.com",
    provider: "Crunchy Data",
  },
  {
    host: "cluster-do-user-1234567-0.db.ondigitalocean.com",
    provider: "DigitalOcean",
  },
  {
    host: "my-db.fly.dev",
    provider: "Fly.io",
  },
  {
    host: "ep-autumn-frost-alwlmval-pooler.ap-southeast-1 .aws.neon.tech",
    provider: "Neon",
  },
  {
    host: "my-db.horizon.psdb.cloud",
    provider: "PlanetScale",
  },
  {
    host: "nodejs-copy-production-7aa4.up.railway.app",
    provider: "Railway",
  },
  {
    host: "your_host_name.your_region-postgres.render.com",
    provider: "Render",
  },
  {
    host: "my-db.region-1.scw.cloud",
    provider: "Scaleway",
  },
  {
    host: "db.apbkobhfnmcqqzqeeqss.supabase.co",
    provider: "Supabase",
  },
  {
    host: "my-db.pooler.supabase.com",
    provider: "Supabase",
  },
  {
    host: "service.project.tsdb.cloud.timescale.com",
    provider: "Timescale",
  },
];

describe("detectDBProvider", () => {
  describe("should detect providers correctly", () => {
    testCases.forEach(({ host, provider }) => {
      it(`should detect ${provider} from host: ${host}`, () => {
        expect(detectDBProvider(host, config)).toBe(provider);
      });
    });
  });

  describe("edge cases", () => {
    it("should return null for empty host", () => {
      expect(detectDBProvider("", config)).toBeNull();
    });

    it("should return null for unknown host", () => {
      expect(detectDBProvider("unknown-host.com", config)).toBeNull();
    });

    it("should return null for localhost", () => {
      expect(detectDBProvider("localhost", config)).toBeNull();
    });

    it("should return null for IP address", () => {
      expect(detectDBProvider("192.168.1.1", config)).toBeNull();
    });

    it("should not detect Amazon RDS from non-rds host", () => {
      expect(detectDBProvider("ec2.amazonaws.com", config)).toBeNull();
    });
  });
});
