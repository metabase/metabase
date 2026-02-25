import type { Edge } from '@xyflow/react'
import type {
  ExtensionToWebviewMessage,
  GraphNodeModel,
  GraphViewEdge,
  GraphViewNode,
} from '../../src/shared-types'
import type { GraphSelection, IsolatedPath } from './GraphContext'
import type { GraphNodeType } from './GraphNode'
import {
  Background,
  Controls,

  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
} from '@xyflow/react'
import { useEffect, useMemo, useState } from 'react'
import { GraphContext } from './GraphContext'
import { GraphDependencyPanel } from './GraphDependencyPanel'
import { GraphEdge } from './GraphEdge'
import { GraphFilterDropdown } from './GraphFilterDropdown'
import { GraphInfoPanel } from './GraphInfoPanel'
import { GraphNodeComponent } from './GraphNode'
import { GraphNodeLayout } from './GraphNodeLayout'
import { GraphSearchInput } from './GraphSearchInput'
import { vscode } from './vscode'
import '@xyflow/react/dist/style.css'

const NODE_TYPES = {
  node: GraphNodeComponent,
}

const EDGE_TYPES = {
  edge: GraphEdge,
}

const PRO_OPTIONS = {
  hideAttribution: true,
}

const MIN_ZOOM = 0.1
const MAX_ZOOM = 1

function getColorMode(): 'light' | 'dark' {
  const themeKind = document.body.dataset.vscodeThemeKind
  return themeKind === 'vscode-dark' || themeKind === 'vscode-high-contrast'
    ? 'dark'
    : 'light'
}

function buildFlowNodes(viewNodes: GraphViewNode[]): GraphNodeType[] {
  return viewNodes.map(viewNode => ({
    id: viewNode.key,
    type: 'node',
    data: viewNode,
    position: { x: 0, y: 0 },
    draggable: false,
    deletable: false,
  }))
}

function buildFlowEdges(viewEdges: GraphViewEdge[]): Edge[] {
  return viewEdges.map(viewEdge => ({
    id: `${viewEdge.sourceKey}->${viewEdge.targetKey}`,
    type: 'edge',
    source: viewEdge.sourceKey,
    target: viewEdge.targetKey,
    selectable: false,
    deletable: false,
  }))
}

function DependencyGraphInner() {
  const [viewNodes, setViewNodes] = useState<GraphViewNode[]>([])
  const [viewEdges, setViewEdges] = useState<GraphViewEdge[]>([])
  const [nodes, setNodes, onNodesChange] = useNodesState<GraphNodeType>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selection, setSelection] = useState<GraphSelection | null>(null)
  const [isolatedPath, setIsolatedPath] = useState<IsolatedPath | null>(null)
  const [visibleModels, setVisibleModels] = useState<Set<GraphNodeModel>>(new Set())
  const [configExists, setConfigExists] = useState(false)
  const [colorMode, setColorMode] = useState<'light' | 'dark'>(getColorMode())
  const [pendingFocusKey, setPendingFocusKey] = useState<string | null>(null)
  const { fitView, getNodes } = useReactFlow<GraphNodeType>()
  const nodesInitialized = useNodesInitialized()

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const message = event.data as ExtensionToWebviewMessage
      switch (message.type) {
        case 'init':
          setConfigExists(message.configExists)
          setViewNodes(message.nodes)
          setViewEdges(message.edges)
          setNodes(buildFlowNodes(message.nodes))
          setEdges(buildFlowEdges(message.edges))
          setSelection(null)
          setIsolatedPath(null)
          break
        case 'configExistsChanged':
          setConfigExists(message.configExists)
          break
        case 'themeChanged':
          setColorMode(message.colorMode)
          break
        case 'focusNode':
          setPendingFocusKey(message.nodeKey)
          break
      }
    }

    window.addEventListener('message', handleMessage)
    vscode.postMessage({ type: 'ready' })

    return () => window.removeEventListener('message', handleMessage)
  }, [setNodes, setEdges, setSelection])

  useEffect(() => {
    if (!pendingFocusKey || !nodesInitialized)
      return
    const flowNodes = getNodes()
    const targetNode = flowNodes.find(node => node.id === pendingFocusKey)
    if (targetNode) {
      setSelection({ key: pendingFocusKey, model: targetNode.data.model })
      requestAnimationFrame(() => {
        fitView({ nodes: [targetNode], duration: 300 })
      })
      setPendingFocusKey(null)
    }
  }, [pendingFocusKey, nodesInitialized, getNodes, fitView, setSelection])

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setColorMode(getColorMode())
    })
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-vscode-theme-kind'],
    })
    return () => observer.disconnect()
  }, [])

  const selectedNode = useMemo(() => {
    if (!selection)
      return null
    return viewNodes.find(node => node.key === selection.key) ?? null
  }, [viewNodes, selection])

  const handlePanelClose = () => {
    setSelection(null)
  }

  if (!configExists) {
    return (
      <div className="centered-message">
        <p>Open a folder with Metabase content exported via Remote Sync.</p>
      </div>
    )
  }

  if (viewNodes.length === 0) {
    return (
      <div className="centered-message">
        <p>No entities found. Run "Metabase: Show Dependency Graph" after loading a Metabase export.</p>
      </div>
    )
  }

  return (
    <GraphContext.Provider value={{ selection, setSelection, isolatedPath, setIsolatedPath, visibleModels, setVisibleModels }}>
      <ReactFlow
        className="dependency-graph"
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        proOptions={PRO_OPTIONS}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        colorMode={colorMode}
        fitView
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
      >
        <Background />
        <Controls className="graph-controls" showInteractive={false} />
        <GraphNodeLayout />
        <Panel className="graph-left-panel" position="top-left">
          <div className="graph-panel-content">
            {viewNodes.length > 1 && <GraphSearchInput nodes={viewNodes} />}
            {viewNodes.length > 1 && <GraphFilterDropdown nodes={viewNodes} />}
          </div>
        </Panel>
        {selection !== null && selectedNode !== null && (
          <Panel className="graph-right-panel" position="top-right">
            {selection.groupType != null
              ? (
                  <GraphDependencyPanel
                    node={selectedNode}
                    groupType={selection.groupType}
                    allNodes={viewNodes}
                    allEdges={viewEdges}
                    onClose={handlePanelClose}
                  />
                )
              : (
                  <GraphInfoPanel
                    node={selectedNode}
                    allEdges={viewEdges}
                    onClose={handlePanelClose}
                  />
                )}
          </Panel>
        )}
      </ReactFlow>
    </GraphContext.Provider>
  )
}

export function App() {
  return (
    <ReactFlowProvider>
      <DependencyGraphInner />
    </ReactFlowProvider>
  )
}
