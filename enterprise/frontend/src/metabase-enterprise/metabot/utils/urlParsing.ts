/**
 * Utility functions for parsing Metabase entity URLs and extracting entity information
 */

export interface ParsedMetabaseEntity {
  model: string;
  id: number;
  name: string;
}

/**
 * URL patterns for different Metabase entities
 */
const URL_PATTERNS = [
  // Questions: /question/123 or /question/123-question-name
  {
    pattern: /\/question\/(\d+)(?:-(.+))?/,
    model: "card",
    extractName: (matches: RegExpMatchArray) => {
      const slug = matches[2];
      if (slug) {
        // Decode URL encoding and replace hyphens with spaces
        const decoded = decodeURIComponent(slug).replace(/-/g, " ");
        return capitalizeWords(decoded);
      }
      return `Question ${matches[1]}`;
    },
  },

  // Models: /model/1-orders-people or /model/1
  {
    pattern: /\/model\/(\d+)(?:-(.+))?/,
    model: "model",
    extractName: (matches: RegExpMatchArray) => {
      const slug = matches[2];
      if (slug) {
        // Decode URL encoding and replace hyphens with spaces
        const decoded = decodeURIComponent(slug).replace(/-/g, " ");
        return capitalizeWords(decoded);
      }
      return `Model ${matches[1]}`;
    },
  },

  // Dashboards: /dashboard/456 or /dashboard/456-dashboard-name
  {
    pattern: /\/dashboard\/(\d+)(?:-(.+))?/,
    model: "dashboard",
    extractName: (matches: RegExpMatchArray) => {
      const slug = matches[2];
      if (slug) {
        // Decode URL encoding and replace hyphens with spaces
        const decoded = decodeURIComponent(slug).replace(/-/g, " ");
        return capitalizeWords(decoded);
      }
      return `Dashboard ${matches[1]}`;
    },
  },

  // Tables: /question#?db=1&table=2 (URL fragment pattern)
  {
    pattern: /\/question#.*[?&]table=(\d+)/,
    model: "table",
    extractName: (matches: RegExpMatchArray) => `Table ${matches[1]}`,
  },

  // Tables (legacy admin): /admin/datamodel/database/1/table/2
  {
    pattern: /\/admin\/datamodel\/database\/\d+\/table\/(\d+)/,
    model: "table",
    extractName: (matches: RegExpMatchArray) => `Table ${matches[1]}`,
  },

  // Databases: /browse/databases/1 or /browse/databases/1-database-name
  {
    pattern: /\/browse\/databases\/(\d+)(?:-(.+))?/,
    model: "database",
    extractName: (matches: RegExpMatchArray) => {
      const slug = matches[2];
      if (slug) {
        // Decode URL encoding and replace hyphens with spaces
        const decoded = decodeURIComponent(slug).replace(/-/g, " ");
        return capitalizeWords(decoded);
      }
      return `Database ${matches[1]}`;
    },
  },

  // Collections: /collection/789 or /collection/789-collection-name
  {
    pattern: /\/collection\/(\d+)(?:-(.+))?/,
    model: "collection",
    extractName: (matches: RegExpMatchArray) => {
      const slug = matches[2];
      if (slug) {
        // Decode URL encoding and replace hyphens with spaces
        const decoded = decodeURIComponent(slug).replace(/-/g, " ");
        return capitalizeWords(decoded);
      }
      return `Collection ${matches[1]}`;
    },
  },

  // Transforms: /admin/transforms/3
  {
    pattern: /\/admin\/transforms\/(\d+)/,
    model: "transform",
    extractName: (matches: RegExpMatchArray) => `Transform ${matches[1]}`,
  },

  // Metrics: /metric/19-number-of-orders or /metric/19
  {
    pattern: /\/metric\/(\d+)(?:-(.+))?/,
    model: "metric",
    extractName: (matches: RegExpMatchArray) => {
      const slug = matches[2];
      if (slug) {
        // Decode URL encoding and replace hyphens with spaces
        const decoded = decodeURIComponent(slug).replace(/-/g, " ");
        return capitalizeWords(decoded);
      }
      return `Metric ${matches[1]}`;
    },
  },

  // Segments: /segment/15-active-users or /segment/15
  {
    pattern: /\/segment\/(\d+)(?:-(.+))?/,
    model: "segment",
    extractName: (matches: RegExpMatchArray) => {
      const slug = matches[2];
      if (slug) {
        // Decode URL encoding and replace hyphens with spaces
        const decoded = decodeURIComponent(slug).replace(/-/g, " ");
        return capitalizeWords(decoded);
      }
      return `Segment ${matches[1]}`;
    },
  },

  // Documents: /document/456
  {
    pattern: /\/document\/(\d+)(?:-(.+))?/,
    model: "document",
    extractName: (matches: RegExpMatchArray) => {
      const slug = matches[2];
      if (slug) {
        // Decode URL encoding and replace hyphens with spaces
        const decoded = decodeURIComponent(slug).replace(/-/g, " ");
        return capitalizeWords(decoded);
      }
      return `Document ${matches[1]}`;
    },
  },
];

/**
 * Attempts to parse a URL and extract Metabase entity information
 */
export function parseMetabaseUrl(url: string): ParsedMetabaseEntity | null {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;

    for (const { pattern, model, extractName } of URL_PATTERNS) {
      const matches = pathname.match(pattern);
      if (matches) {
        const id = parseInt(matches[1], 10);
        const name = extractName(matches);

        return {
          model,
          id,
          name,
        };
      }
    }

    return null;
  } catch (error) {
    // Invalid URL
    return null;
  }
}

/**
 * Checks if a URL looks like a Metabase entity URL
 */
export function isMetabaseEntityUrl(url: string): boolean {
  return parseMetabaseUrl(url) !== null;
}

/**
 * Capitalizes the first letter of each word in a string
 */
function capitalizeWords(str: string): string {
  return str
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
