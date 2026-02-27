import { describe, expect, it } from 'vitest'
import { extractCodeFromYaml, updateCodeInYaml } from '../src/yaml-code-helpers'

const SQL_TRANSFORM_YAML = `entity_id: abc123
name: My SQL Transform
description: A test transform
source:
  query:
    database: My Database
    type: native
    native:
      query: SELECT * FROM users WHERE id = 1
  type: query
target:
  database: My Database
  schema: public
  name: target_table
  type: table
serdes/meta:
- id: abc123
  model: Transform
`

const PYTHON_TRANSFORM_YAML = `entity_id: def456
name: My Python Transform
description: A python transform
source:
  query:
    database: My Database
    type: python
    body: |
      import pandas as pd
      df = pd.read_csv('data.csv')
      print(df.head())
    source-tables: {}
    source-database: 1
  type: query
target:
  database: My Database
  schema: public
  name: python_target
  type: table
serdes/meta:
- id: def456
  model: Transform
`

describe('extractCodeFromYaml', () => {
  it('extracts SQL from a native transform', () => {
    const code = extractCodeFromYaml(SQL_TRANSFORM_YAML, 'sql')
    expect(code).toBe('SELECT * FROM users WHERE id = 1')
  })

  it('extracts Python from a python transform', () => {
    const code = extractCodeFromYaml(PYTHON_TRANSFORM_YAML, 'python')
    expect(code).toContain('import pandas as pd')
    expect(code).toContain("df = pd.read_csv('data.csv')")
    expect(code).toContain('print(df.head())')
  })

  it('returns empty string when code path is missing for sql', () => {
    const yaml = `entity_id: x\nsource:\n  query:\n    type: native\n`
    const code = extractCodeFromYaml(yaml, 'sql')
    expect(code).toBe('')
  })

  it('returns empty string when code path is missing for python', () => {
    const yaml = `entity_id: x\nsource:\n  query:\n    type: python\n`
    const code = extractCodeFromYaml(yaml, 'python')
    expect(code).toBe('')
  })
})

describe('updateCodeInYaml', () => {
  it('updates SQL code in a native transform', () => {
    const updated = updateCodeInYaml(SQL_TRANSFORM_YAML, 'sql', 'SELECT count(*) FROM orders')
    const extracted = extractCodeFromYaml(updated, 'sql')
    expect(extracted).toBe('SELECT count(*) FROM orders')
  })

  it('updates Python code in a python transform', () => {
    const newCode = 'import numpy as np\nresult = np.sum([1, 2, 3])'
    const updated = updateCodeInYaml(PYTHON_TRANSFORM_YAML, 'python', newCode)
    const extracted = extractCodeFromYaml(updated, 'python')
    expect(extracted).toBe(newCode)
  })

  it('preserves other YAML fields after SQL update', () => {
    const updated = updateCodeInYaml(SQL_TRANSFORM_YAML, 'sql', 'SELECT 1')
    expect(updated).toContain('entity_id: abc123')
    expect(updated).toContain('name: My SQL Transform')
    expect(updated).toContain('description: A test transform')
    expect(updated).toContain('database: My Database')
    expect(updated).toContain('schema: public')
    expect(updated).toContain('model: Transform')
  })

  it('preserves other YAML fields after Python update', () => {
    const updated = updateCodeInYaml(PYTHON_TRANSFORM_YAML, 'python', 'print("hello")')
    expect(updated).toContain('entity_id: def456')
    expect(updated).toContain('name: My Python Transform')
    expect(updated).toContain('source-tables: {}')
    expect(updated).toContain('schema: public')
  })

  it('handles multiline SQL with block literal style', () => {
    const multilineSql = 'SELECT\n  u.name,\n  u.email\nFROM users u\nWHERE u.active = true'
    const updated = updateCodeInYaml(SQL_TRANSFORM_YAML, 'sql', multilineSql)
    const extracted = extractCodeFromYaml(updated, 'sql')
    expect(extracted).toBe(multilineSql)
  })

  it('handles code with special YAML characters (colons, quotes)', () => {
    const code = "SELECT * FROM users WHERE name = 'O''Brien' AND role: admin"
    const updated = updateCodeInYaml(SQL_TRANSFORM_YAML, 'sql', code)
    const extracted = extractCodeFromYaml(updated, 'sql')
    expect(extracted).toBe(code)
  })

  it('round-trips: extract, modify, update, extract matches modification', () => {
    const original = extractCodeFromYaml(SQL_TRANSFORM_YAML, 'sql')
    const modified = original + '\nLIMIT 10'
    const updated = updateCodeInYaml(SQL_TRANSFORM_YAML, 'sql', modified)
    const extracted = extractCodeFromYaml(updated, 'sql')
    expect(extracted).toBe(modified)
  })
})
