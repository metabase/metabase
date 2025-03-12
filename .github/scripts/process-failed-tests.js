const fs = require('fs');
const path = require('path');

function processFailedTests() {
  const failedTestsDir = 'failed-tests';
  const testGroup = process.env.TEST_GROUP;

  console.log('Current working directory:', process.cwd());

  if (!fs.existsSync(failedTestsDir)) {
    console.log(`No failed test results found for ${testGroup}`);
    return;
  }

  // Log directory structure
  console.log('Directory structure of failed-tests:');
  function logDir(dir, prefix = '') {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      console.log(`${prefix}${item.name}${item.isDirectory() ? '/' : ''}`);
      if (item.isDirectory()) {
        logDir(path.join(dir, item.name), prefix + '  ');
      }
    }
  }
  logDir(failedTestsDir);

  console.log(`Found failed test results for ${testGroup}:`);
  const specs = new Set();

  // Read all files in the directory recursively
  function processDirectory(dir) {
    const files = fs.readdirSync(dir, { withFileTypes: true });

    for (const file of files) {
      const fullPath = path.join(dir, file.name);

      if (file.isDirectory()) {
        processDirectory(fullPath);
        continue;
      }

      console.log(`Processing ${fullPath}`);
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const results = JSON.parse(content);

        // Handle both JSON structures
        if (Array.isArray(results)) {
          // Handle array structure: [{"spec": "path/to/spec.cy.spec.ts", ...}]
          results.forEach(result => {
            if (result.spec) {
              specs.add(result.spec);
              console.log(`Found spec: ${result.spec}`);
            }
          });
        } else if (results.results?.[0]?.file) {
          // Handle object structure: { results: [{ file: "path/to/spec.cy.spec.ts" }] }
          const specPath = results.results[0].file;
          specs.add(specPath);
          console.log(`Found spec: ${specPath}`);
        } else {
          console.log(`No valid spec path in ${fullPath}. JSON structure:`, JSON.stringify(results, null, 2));
        }
      } catch (error) {
        if (error instanceof SyntaxError) {
          console.log(`Invalid JSON in ${fullPath}`);
        } else {
          console.log(`Error processing ${fullPath}: ${error.message}`);
        }
      }
    }
  }

  processDirectory(failedTestsDir);

  const specsList = Array.from(specs);
  if (specsList.length > 0) {
    console.log(`Found failed specs for ${testGroup}: ${specsList.join(',')}`);
    // Set output for GitHub Actions
    const output = process.env.GITHUB_OUTPUT;
    if (output) {
      fs.appendFileSync(output, `specs=${specsList.join(',')}\n`);
    }
  } else {
    console.log(`No valid spec paths found in results for ${testGroup}`);
  }
}

processFailedTests();
