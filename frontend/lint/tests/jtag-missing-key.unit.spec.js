import { RuleTester } from "eslint";

import jtagKey from "../eslint-rules/jtag-missing-key";

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2015,
    sourceType: "module",
    parserOptions: {
      ecmaFeatures: { jsx: true },
    },
  },
});

const VALID_CASES = [
  {
    // JSX with key prop in jt`` tagged template
    code: `
const message = c("Context").jt\`Get started with \${(<EmbeddingTypeDropdown key="dropdown" />)}\`;`,
  },
  {
    // JSX with key prop in jt`` tagged template (direct jt)
    code: `
const message = jt\`Welcome \${(<div key="test-div">test</div>)}\`;`,
  },
  {
    // Multiple JSX elements with key props
    code: `
const message = t.jt\`Click \${(<button key="btn">here</button>)} or \${(<a key="link" href="#">there</a>)}\`;`,
  },
  {
    // JSX not in jt tagged template should be ignored
    code: `
const element = <div>Not in jt template</div>;`,
  },
  {
    // Regular template literal without JSX
    code: `
const message = jt\`Just a regular template with \${variable}\`;`,
  },
  {
    // Regular template literal not tagged with jt
    code: `
const message = \`Template with \${(<div>JSX</div>)}\`;`,
  },
  {
    // JSX fragment with all children having keys - valid
    code: `
const message = jt\`Fragment \${(<><Icon key="icon" name="test" /><span key="text">content</span></>)}\`;`,
  },
  {
    // JSX elements within props should be ignored - valid
    code: `
const message = jt\`Select time \${(<Select key="select" leftSection={<Icon name="calendar" />} />)}\`;`,
  },
  {
    // Nested JSX with outer key is valid - inner elements don't need keys for templates
    code: `
const message = jt\`rows in the \${(<strong key="table-name"><EntityName entityType="tables" entityId={id} /></strong>)} table\`;`,
  },
];

const INVALID_CASES = [
  {
    name: "JSX element without key in jt`` tagged template (member expression)",
    code: `
const message = jt\`Get started with \${(<EmbeddingTypeDropdown />)}\`;`,
    error: /JSX elements in jt`` tagged templates must have a key prop/,
  },
  {
    name: "JSX element without key in jt`` tagged template (direct identifier)",
    code: `
const message = jt\`Welcome \${(<div>test</div>)}\`;`,
    error: /JSX elements in jt`` tagged templates must have a key prop/,
  },
  {
    name: "Multiple JSX elements, one missing key",
    code: `
const message = jt\`Click \${(<button key="btn">here</button>)} or \${(<a href="#">there</a>)}\`;`,
    error: /JSX elements in jt`` tagged templates must have a key prop/,
  },
  {
    name: "JSX element without key (only direct children flagged)",
    code: `
const message = jt\`Hello \${(<div><span>nested</span></div>)}\`;`,
    error: /JSX elements in jt`` tagged templates must have a key prop/,
    errorCount: 1, // Only the direct child (div) needs key, nested span is React's responsibility
  },
  {
    name: "JSX fragment with missing keys on children",
    code: `
const message = jt\`Fragment \${(<><Icon name="test" /><span>content</span></>)}\`;`,
    error:
      /JSX fragments in jt`` tagged templates must have all JSX element children with key props/,
  },
];

ruleTester.run("jtag-key", jtagKey, {
  valid: VALID_CASES,
  invalid: INVALID_CASES.map((invalidCase) => {
    const errorCount = invalidCase.errorCount || 1;
    return {
      code: invalidCase.code,
      errors: Array(errorCount)
        .fill()
        .map(() => ({
          message: invalidCase.error,
        })),
    };
  }),
});
