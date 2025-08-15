#!/usr/bin/env node

// Simple validation script to check if the fix is correct
const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying the bug fix...\n');

// Check 1: Verify the main component file has "Language" instead of "Locale Code"
const componentPath = 'enterprise/frontend/src/metabase-enterprise/content_translation/components/ContentTranslationConfiguration/ContentTranslationConfiguration.tsx';
const componentContent = fs.readFileSync(componentPath, 'utf8');

if (componentContent.includes('t`Language`')) {
  console.log('✅ Component file correctly shows "Language"');
} else {
  console.log('❌ Component file still shows "Locale Code"');
}

// Check 2: Verify the test file expects "Language" instead of "Locale Code"
const testPath = 'enterprise/frontend/src/metabase-enterprise/content_translation/components/ContentTranslationConfiguration/tests/common.unit.spec.tsx';
const testContent = fs.readFileSync(testPath, 'utf8');

if (testContent.includes('screen.getByText("Language")')) {
  console.log('✅ Test file correctly expects "Language"');
} else {
  console.log('❌ Test file still expects "Locale Code"');
}

// Check 3: Verify the main translation file has "Language"
const translationPath = 'locales/metabase.po';
const translationContent = fs.readFileSync(translationPath, 'utf8');

if (translationContent.includes('msgid "Language"') && !translationContent.includes('msgid "Locale Code"')) {
  console.log('✅ Base translation file correctly uses "Language"');
} else {
  console.log('❌ Base translation file issue detected');
}

// Check 4: Verify backend expects "Language" (this should be unchanged)
const backendPath = 'enterprise/backend/src/metabase_enterprise/content_translation/dictionary.clj';
const backendContent = fs.readFileSync(backendPath, 'utf8');

if (backendContent.includes('Expected exactly 3 columns (Language, String, Translation)')) {
  console.log('✅ Backend correctly expects "Language"');
} else {
  console.log('❌ Backend issue detected');
}

console.log('\n🎉 Bug fix verification complete!');
console.log('\nSummary of changes:');
console.log('- UI now displays "Language" instead of "Locale Code"');
console.log('- This matches what the backend actually expects');
console.log('- Tests updated to reflect the change');
console.log('- Translation files updated for consistency');