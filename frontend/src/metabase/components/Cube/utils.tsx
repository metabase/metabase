
export interface FieldData {
    id: string;
    table: string;
    field: string;
  }
  
  export interface CubeFlowProps {
    cubes: { content: string }[];
  }
  
  interface CubeInfo {
    fields: { [fieldName: string]: string };
  }
  
  interface Field {
    name: string;
    type: "source" | "target";
    key?: boolean;
    lock?: boolean;
  }
  
  interface Node {
    id: string;
    label: string;
    fields: Field[];
    cubeInfo?: CubeInfo;
  }
  
  interface Edge {
    source: string;
    target: string;
    sourceHandle: string;
    targetHandle: string;
  }
  
  interface GraphData {
    nodes: Node[];
    edges: Edge[];
  }
  
  interface ExtractedField {
    id: string;
    table: string;
    field: string;
  }
  
  type ExtractedData = {
    [tableName: string]: ExtractedField[];
  };
  
  export interface CubeData {
    [tableName: string]: CubeInfo;
  }
  
  export const formatAndCleanCubeContent = (content: string) => {
      const removeCubeWrapper = (str: string) => {
        let result = str.replace(/^cube\(`[^`]+`,/, '').replace(/\);$/, '');
        return result.trim();
      };
    
      const formatContent = (str: string) => {
        let indentLevel = 0;
        const indent = '  '; 
    
        if (str === undefined) {
          return '';
        }
    
        return str.replace(/[{},]/g, (match: string) => {
          if (match === '{') {
            indentLevel++;
            return `{\n${indent.repeat(indentLevel)}`;
          }
          if (match === '}') {
            indentLevel--;
            return `\n${indent.repeat(indentLevel)}}`;
          }
          if (match === ',') {
            return `,\n${indent.repeat(indentLevel)}`;
          }
          return match; 
        });
      };
    
      const cleanedContent = removeCubeWrapper(content);
      const formattedContent = formatContent(cleanedContent);
    
      return formattedContent;
    };
    
  export function extractCubeName(cubeString: string): string {
      const cubeRegex = /cube\(`([^`]+)`/;
      const match = cubeString.match(cubeRegex);
      if (match && match[1]) {
        return match[1].trim();
      }
      throw new Error('Cube name not found');
    }
  
    export function extractCubeNames(content:any) {
      const cubeRegex = /cube\s*\(`([^`]+)`/g;
      const cubeNames = [];
      let match;
    
      while ((match = cubeRegex.exec(content)) !== null) {
          cubeNames.push(match[1]);
      }
    
      return cubeNames;
    }
    
    export function separateCubes(input:string) {
      const cubeDefinitions = input.split(/cube\(/).slice(1);
      const cubes = cubeDefinitions.map(cubeDef => 'cube(' + cubeDef.trim());
      return cubes;
    }
  
    export function removeLineBreaks(str:string) {
      return str.replace(/\n\s*/g, '');
    }
  
    export const addCubeWrapper = (content: string, cubeName: string) => {
      const trimmedContent = content.trim();
      return `cube(\`${cubeName}\`, ${trimmedContent});`;
    };
  
  export function extractAllJoins(cubesContent: string[]): Record<string, string[]> {
    const allJoins: Record<string, string[]> = {};
    const allJoinsContent: Record<string, string[]> = {};
  
    cubesContent.forEach(content => {
      const cubeName = extractCubeName(content);
  
      const joinContent = extractJoinsContent(content)
      // console.log('join content', joinContent)
  
      
      if(!joinContent) return;
      const joinEntriesFrm = joinContent.split(/},\s*(?=\w+:)/).map(entry => entry.trim());
  
      allJoins[cubeName] = [];
      allJoinsContent[cubeName] = []
      joinEntriesFrm.forEach(entry => {
        const joinedCube = entry.match(/(\w+):\s*{/)?.[1];
        const relationshipMatch = entry.match(/relationship:\s*['"`](\w+)['"`]/);
        
        if (joinedCube && relationshipMatch && relationshipMatch[1].toLowerCase() === 'belongsto') {
          allJoins[cubeName].push(joinedCube);
        }
      });
      if (allJoins[cubeName].length === 0) {
        delete allJoins[cubeName];
      }
    });
  
    console.log("Extracted all belongsTo joins:", allJoins);
    return allJoins;
  }
  
  function extractJoinsContent(input:string) {
    const joinsStart = input.indexOf('joins:');
    if (joinsStart === -1) return null;
  
    let openBraces = 0;
    let closeBraces = 0;
    let endIndex = joinsStart + 6; // Start after 'joins:'
  
    for (let i = endIndex; i < input.length; i++) {
      if (input[i] === '{') openBraces++;
      if (input[i] === '}') closeBraces++;
      
      if (openBraces > 0 && openBraces === closeBraces) {
        endIndex = i + 1;
        break;
      }
    }
  
    const joinsContent = input.slice(joinsStart + 6, endIndex).trim();
    return joinsContent.slice(1, -1).trim(); // Remove outer braces
  }
  
  export function extractMainQuery(input: string): string | null {
    const sqlMatch = input.match(/sql:\s*(`|"|')(.*?)\1/);
    
    if (sqlMatch && sqlMatch[2]) {
      return sqlMatch[2].trim();
    }
    
    return null;
  }
  
  export function extractSQLInfo(input: string) {
    const result: { mainTable: string | null; fields: { [key: string]: string } } = {
      mainTable: null,
      fields: {}
    };
  
    // Extract main table name
    const mainTableMatch = input.match(/sql:\s*`SELECT\s+\*\s+FROM\s+public\.(\w+)`/);
    if (mainTableMatch) {
      result.mainTable = mainTableMatch[1];
    }
  
    // Extract field SQL snippets
    const fieldMatches = input.matchAll(/(\w+):\s*{\s*sql:\s*`([^`]+)`/g);
    const seenFields = new Set<string>();
  
    for (const match of fieldMatches) {
      const [, fieldName, fieldSQL] = match;
      if (!fieldSQL.includes('CAST') && !seenFields.has(fieldSQL)) {
        result.fields[fieldName] = fieldSQL;
        seenFields.add(fieldSQL);
      }
    }
  
    return result;
  }
  
  export function extractTableName(cubeDefinition:string):string {
    const tableNameMatch = cubeDefinition.match(/sql:\s*`SELECT\s+\*\s+FROM\s+public\.(\w+)`/);
    return tableNameMatch ? tableNameMatch[1] : '';
  }
  
  export function newExtractAllJoins(cubesContent: string[]): Record<string, string[]> {
    const allJoins: Record<string, string[]> = {};
  
    cubesContent.forEach(content => {
      const cubeName = extractTableName(content);
      // console.log('cubeName', cubeName)
  
      const joinContent = extractJoinsContent(content);
      // console.log('join content', joinContent);
  
      if (!joinContent) return;
  
      const joinEntriesFrm = joinContent.split(/},\s*(?=\w+:)/).map(entry => entry.trim());
  
      allJoins[cubeName] = [];
  
      joinEntriesFrm.forEach(entry => {
        const joinedCubeMatch = entry.match(/(\w+):\s*{/);
        const relationshipMatch = entry.match(/relationship:\s*['"`](\w+)['"`]/);
        const sqlMatch = entry.match(/sql:\s*`([^`]+)`/);
  
        if (joinedCubeMatch && relationshipMatch && sqlMatch && relationshipMatch[1].toLowerCase() === 'belongsto') {
          const joinedCube = joinedCubeMatch[1];
          const sqlCondition = sqlMatch[1];
          allJoins[cubeName].push(`${sqlCondition}`);
        }
      });
  
      if (allJoins[cubeName].length === 0) {
        delete allJoins[cubeName];
      }
    });
  
    return allJoins;
  }
  
  export const extractFields = (cubes:any) => {
    let fields:FieldData[] = [];
    cubes.forEach((cube:any) => {
      const cubeName = cube.fileName.replace('.js', '').toLowerCase();
      const table = `csv_${cubeName}`;
      const regex = /(\w+): { sql: `(\w+)`, type: `(\w+)` }/g;
      let match;
      while ((match = regex.exec(cube.content)) !== null) {
        const field = match[2];
        fields.push({ id: `${table}-${field}`, table, field });
      }
    });
    return fields;
  };
  
  export function createGraphData(extractedData: ExtractedData, cubeData: CubeData, tableArr: string[], cubeArr: string[]): GraphData {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const sourceFields: { [fieldName: string]: string } = {};
  
    // Create nodes
    for (const [tableName, fields] of Object.entries(extractedData)) {
      let tableOriginalName = getTableName(tableName, tableArr, cubeArr )
      const node: Node = {
        id: tableName,
        label: tableName,
        fields: fields.map(field => ({
          name: field.field,
          type: "target",
          key: field.field.endsWith('_id'),
          lock: field.field.endsWith('_id')
        })),
        cubeInfo: cubeData[tableOriginalName]
      };
      nodes.push(node);
  
      // Store source fields for edge creation
      fields.forEach(field => {
        if (field.field.endsWith('_id')) {
          sourceFields[field.field] = tableName;
        }
      });
    }
  
    // Create edges
    for (const [tableName, fields] of Object.entries(extractedData)) {
      fields.forEach(field => {
        if (field.field.endsWith('_id') && sourceFields[field.field] !== tableName) {
          const edge: Edge = {
            source: tableName,
            target: sourceFields[field.field],
            sourceHandle: field.field,
            targetHandle: field.field
          };
          edges.push(edge);
        }
      });
    }
  
    // Update source fields
    nodes.forEach(node => {
      node.fields = node.fields.map(field => ({
        ...field,
        type: sourceFields[field.name] === node.id ? "source" : "target"
      }));
    });
    
    return { nodes, edges };
  }
  
  const getTableName = (cubeName: string, cubeNameArr: string[], tableNameArr: string[]) => {
    let idx = 0;
    for (let i = 0; i < cubeNameArr.length; i++) {
      if (cubeName === cubeNameArr[i]) {
        idx = i;
      }
    }
    return tableNameArr[idx];
  };
  
  export const tableArr = (cubes:any) => {
    let tableNameArr
    cubes.forEach((cube:any) => {
      const tableName = extractTableName(cube.content);
      tableNameArr.push(tableName);
    });
    return tableNameArr
  }
  
  export const cubeArr = (cubes:any) => {
    let cubeNameArr
    cubes.forEach((cube:any) => {
      const cubeName = extractCubeName(cube.content);
      cubeNameArr.push(cubeName);
    });
    return cubeNameArr
  }