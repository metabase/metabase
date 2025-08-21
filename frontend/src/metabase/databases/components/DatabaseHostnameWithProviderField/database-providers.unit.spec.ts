import {
  type DatabaseProviderName,
  detectDBProvider,
} from "./database-providers";

const testCases: { host: string; provider: DatabaseProviderName }[] = [
  {
    host: "production-flexible-server.postgres.database.azure.com",
    provider: "Azure",
  },
  {
    host: "my-db.rds.amazonaws.com",
    provider: "Amazon RDS",
  },
  {
    host: "my-db.aivencloud.com",
    provider: "Aiven",
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
        expect(detectDBProvider(host)).toBe(provider);
      });
    });
  });

  describe("edge cases", () => {
    it("should return null for empty host", () => {
      expect(detectDBProvider("")).toBeNull();
    });

    it("should return null for unknown host", () => {
      expect(detectDBProvider("unknown-host.com")).toBeNull();
    });

    it("should return null for localhost", () => {
      expect(detectDBProvider("localhost")).toBeNull();
    });

    it("should return null for IP address", () => {
      expect(detectDBProvider("192.168.1.1")).toBeNull();
    });

    it("should not detect Amazon RDS from non-rds host", () => {
      expect(detectDBProvider("ec2.amazonaws.com")).toBeNull();
    });
  });
});
