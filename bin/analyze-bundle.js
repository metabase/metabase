#!/usr/bin/env node
// @ts-check
/* eslint-env node */
/* eslint-disable import/no-commonjs */

/**
 * Bundle Analysis Script
 * 
 * This script helps analyze the Metabase frontend bundle size and identify
 * opportunities for optimization.
 * 
 * Usage:
 *   bun run analyze-bundle           # Generate stats and open analyzer
 *   bun run analyze-bundle --json    # Generate stats only (JSON output)
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const STATS_FILE = path.join(__dirname, "..", "stats.json");

function formatBytes(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
}

function analyzeStats(stats) {
  console.log("\n📊 Bundle Analysis Summary\n");
  console.log("=" .repeat(60));

  if (!stats.assets) {
    console.log("No asset data found in stats");
    return;
  }

  // Group assets by type
  const assetsByType = {
    js: [],
    css: [],
    other: []
  };

  stats.assets.forEach(asset => {
    if (asset.name.endsWith(".js")) {
      assetsByType.js.push(asset);
    } else if (asset.name.endsWith(".css")) {
      assetsByType.css.push(asset);
    } else {
      assetsByType.other.push(asset);
    }
  });

  // Calculate totals
  const totalSize = stats.assets.reduce((sum, a) => sum + a.size, 0);
  const jsSize = assetsByType.js.reduce((sum, a) => sum + a.size, 0);
  const cssSize = assetsByType.css.reduce((sum, a) => sum + a.size, 0);

  console.log("\n📦 Total Bundle Size:");
  console.log(`   ${formatBytes(totalSize)}`);
  console.log(`   JavaScript: ${formatBytes(jsSize)} (${Math.round(jsSize / totalSize * 100)}%)`);
  console.log(`   CSS: ${formatBytes(cssSize)} (${Math.round(cssSize / totalSize * 100)}%)`);

  // Top 10 largest JavaScript files
  console.log("\n🔍 Top 10 Largest JavaScript Files:");
  assetsByType.js
    .sort((a, b) => b.size - a.size)
    .slice(0, 10)
    .forEach((asset, index) => {
      console.log(`   ${index + 1}. ${asset.name}`);
      console.log(`      Size: ${formatBytes(asset.size)}`);
    });

  // Top 5 largest CSS files
  console.log("\n🎨 Top 5 Largest CSS Files:");
  assetsByType.css
    .sort((a, b) => b.size - a.size)
    .slice(0, 5)
    .forEach((asset, index) => {
      console.log(`   ${index + 1}. ${asset.name}`);
      console.log(`      Size: ${formatBytes(asset.size)}`);
    });

  console.log("\n" + "=".repeat(60));
  console.log("\n💡 Next Steps:");
  console.log("   1. Run: npx webpack-bundle-analyzer stats.json");
  console.log("   2. Review docs/developers-guide/bundle-size-reduction.md");
  console.log("   3. Identify optimization opportunities");
  console.log("\n");
}

function main() {
  const args = process.argv.slice(2);
  const jsonOnly = args.includes("--json");

  console.log("🚀 Starting bundle analysis...\n");

  // Check if stats.json already exists
  if (fs.existsSync(STATS_FILE)) {
    console.log("📄 Found existing stats.json file");
    const choice = args.includes("--use-existing") ? "y" : "n";
    
    if (choice === "n") {
      console.log("🔨 Regenerating stats...");
      fs.unlinkSync(STATS_FILE);
    } else {
      console.log("✅ Using existing stats.json");
    }
  }

  // Generate stats if needed
  if (!fs.existsSync(STATS_FILE)) {
    console.log("⏳ Building and generating stats (this may take several minutes)...\n");
    
    try {
      execSync("bun run build-stats", {
        stdio: "inherit",
        cwd: path.join(__dirname, "..")
      });
    } catch (error) {
      console.error("❌ Failed to generate stats:", error.message);
      process.exit(1);
    }
  }

  // Read and analyze stats
  try {
    const statsContent = fs.readFileSync(STATS_FILE, "utf8");
    const stats = JSON.parse(statsContent);

    analyzeStats(stats);

    if (!jsonOnly) {
      console.log("🌐 Opening bundle analyzer in browser...\n");
      
      try {
        execSync("npx webpack-bundle-analyzer stats.json", {
          stdio: "inherit",
          cwd: path.join(__dirname, "..")
        });
      } catch (error) {
        console.log("\n⚠️  Could not open bundle analyzer automatically.");
        console.log("   Run manually: npx webpack-bundle-analyzer stats.json");
      }
    }

  } catch (error) {
    console.error("❌ Failed to analyze stats:", error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
