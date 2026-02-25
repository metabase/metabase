import {parseDocument, Scalar} from 'yaml'

export function extractCodeFromYaml(yamlContent: string, lang: 'sql' | 'python'): string {
  const doc = parseDocument(yamlContent)
  const path = lang === 'sql'
    ? ['source', 'query', 'native', 'query']
    : ['source', 'query', 'body']
  const value = doc.getIn(path)
  return typeof value === 'string' ? value : ''
}

export function updateCodeInYaml(yamlContent: string, lang: 'sql' | 'python', newCode: string): string {
  const doc = parseDocument(yamlContent)
  const path = lang === 'sql'
    ? ['source', 'query', 'native', 'query']
    : ['source', 'query', 'body']

  if (newCode.includes('\n')) {
    const scalar = new Scalar(newCode)
    scalar.type = Scalar.BLOCK_LITERAL
    doc.setIn(path, scalar)
  } else {
    doc.setIn(path, newCode)
  }

  return doc.toString()
}
