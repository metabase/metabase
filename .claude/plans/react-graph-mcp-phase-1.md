# AST Parser & Component Extractor: Phase 1 Implementation Plan

*Created: April 13, 2025*

## Version 1 Goals
For the initial version, we will focus specifically on:
- Parsing React functional and class components
- Extracting basic component information
- Identifying parent-child render relationships
- Generating a simple JSON output file

## Incremental Implementation Steps

### Step 1: Project Setup
- Create basic Node.js project with TypeScript
- Add Babel dependencies for JSX/TSX parsing
- Setup basic CLI structure with Commander.js
- Create configuration file for paths and options
- **Deliverable**: Runnable project skeleton that accepts input/output paths

### Step 2: File System Traversal
- Implement directory walking utility
- Filter for JSX/TSX files
- Handle exclusions (node_modules, tests, etc.)
- Simple logging of discovered files
- **Deliverable**: Utility that finds all React component files

### Step 3: Basic Component Identification
- Implement Babel parser configuration
- Create AST visitor for React components
- Detect functional components (arrow functions, function declarations)
- Detect class components (extending React.Component)
- Extract component names and file paths
- **Deliverable**: In-memory registry of components with locations

### Step 4: Parent-Child Relationship Detection
- Enhance AST visitor to identify JSX elements
- Match JSX element names to component registry
- Build parent-child relationship map
- Handle both direct imports and aliased components
- **Deliverable**: In-memory graph of component relationships

### Step 5: JSON Output Generation
- Design simple JSON schema with nodes and edges
- Convert in-memory component registry to JSON nodes
- Convert relationship map to JSON edges
- Add basic metadata (timestamp, parser version)
- Write to output file
- **Deliverable**: Complete working tool that generates JSON for Neo4j import

## Future Enhancements (Post-Version 1)

### Component Props Analysis
- Enhance AST visitor to extract props
- Identify prop types from TypeScript or PropTypes
- Document default values where available
- Add props to component metadata

### Import/Export Mapping
- Track import statements for each component
- Map components to their import sources
- Create import relationship records
- Add to output format

### State and Hook Detection
- Identify useState, useReducer, and other state hooks
- Extract state variables and their types
- Map state to component behavior

### Context Provider/Consumer Mapping
- Detect React.createContext usage
- Track Provider/Consumer relationships
- Map data flow through context

### Redux Connection Mapping
- Identify connect() and useSelector/useDispatch patterns
- Map components to Redux state
- Track action dispatches

### Advanced Output Formats
- Support direct Neo4j import format
- Add visualization output option
- Support incremental updates to existing graph

## Implementation Notes
- Focus on reliability over completeness for v1
- Use synchronous operations for simplicity in early versions
- Start with a small subset of the codebase for testing
- Include verbose logging options for debugging
- Create test fixtures with sample React components

## Version 1 Success Criteria
- Successfully identify >90% of React components in the codebase
- Correctly map parent-child relationships
- Generate valid JSON that can be imported to Neo4j
- Process the entire Metabase frontend in a reasonable time (<5 minutes)
- Provide clear error messages for parsing failures