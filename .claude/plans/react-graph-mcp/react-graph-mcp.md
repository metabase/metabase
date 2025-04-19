# React Graph MCP - Project Components

*Created: April 13, 2025*

## Overview

The React Graph MCP is a tool designed to enhance Claude's ability to understand and reason about the Metabase React frontend codebase. It consists of three main components that work together to create a queryable graph representation of React components and their relationships.

## Project Components

### 1. AST Parser & Component Extractor
- **Purpose**: Parse React codebase and extract component information
- **Key Elements**:
  - Babel-based parsing system for JSX/TSX files
  - Component metadata extraction (name, props, state, hooks)
  - Relationship identification (parent-child, imports, context)
  - Output format that's ready for database import
- **Output**: JSON file(s) with component definitions and relationships
- **Testing**: Verify correct extraction of components from sample React files

### 2. Neo4j Database Populator
- **Purpose**: Load component data into Neo4j graph database
- **Key Elements**:
  - Neo4j connection and session management
  - Schema design (nodes for components, edges for relationships)
  - Efficient batch import operations
  - Index creation for performance
- **Output**: Populated Neo4j database
- **Testing**: Verify correct import and relationship creation

### 3. Neo4j MCP Server
- **Purpose**: Expose Neo4j querying capabilities to Claude
- **Key Elements**:
  - MCP server using `@modelcontextprotocol/sdk`
  - Tool definitions for common graph queries
  - Cypher query execution and result formatting
  - Error handling and response formatting
- **Output**: Functioning MCP server that Claude can use
- **Testing**: Verify query execution and result formatting

## Potential Tool Definitions

The Neo4j MCP Server would expose tools such as:

1. **find_component**
   - Find components by name, file path, or properties
   - Return component details and metadata

2. **get_component_hierarchy**
   - Show parent-child relationships for a component
   - Return hierarchical view of component usage

3. **trace_component_usage**
   - Find where components are used throughout the codebase
   - Return usage locations and contexts

4. **analyze_component_dependencies**
   - Show import dependencies for a component
   - Return dependency graph information

5. **query_graph**
   - Execute custom Cypher queries against the graph
   - Return formatted results for complex questions

## Implementation Considerations

1. **Performance**: Graph construction should be a one-time or incremental operation, with the MCP server querying the existing graph.

2. **Maintainability**: Code changes will require updates to the graph, so consider automation or integration with build processes.

3. **Security**: The MCP server should validate queries to prevent injection or excessive resource usage.

4. **Extensibility**: Design the schema to accommodate future additions like state management connections or routing information.

5. **Integration**: Ensure Claude has clear examples and documentation for effectively using the graph tools.

## Next Steps

- Determine the specific Neo4j schema design for React components
- Identify the exact metadata to extract for each component type
- Define the format for the intermediate JSON representation
- Establish a detailed implementation plan for each component