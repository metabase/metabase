import type { Edge } from '@xyflow/react'
import type { GraphNodeType } from './GraphNode'
import dagre from '@dagrejs/dagre'
import { useNodesInitialized, useReactFlow } from '@xyflow/react'
import { useContext, useEffect, useLayoutEffect, useRef } from 'react'
import { GraphContext } from './GraphContext'

function getNodesWithPositions(
  nodes: GraphNodeType[],
  edges: Edge[],
): GraphNodeType[] {
  const dagreGraph = new dagre.graphlib.Graph()
  dagreGraph.setGraph({ rankdir: 'LR' })
  dagreGraph.setDefaultEdgeLabel(() => ({}))

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: node.measured?.width,
      height: node.measured?.height,
    })
  })

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.target, edge.source)
  })

  dagre.layout(dagreGraph)

  return nodes.map((node) => {
    const { x, y, width, height } = dagreGraph.node(node.id)
    return {
      ...node,
      position: {
        x: x - width / 2,
        y: y - height / 2,
      },
    }
  })
}

export function GraphNodeLayout() {
  const { getNodes, getEdges, setNodes, fitView }
    = useReactFlow<GraphNodeType>()
  const isInitialized = useNodesInitialized()
  const { isolatedPath } = useContext(GraphContext)
  const savedPositionsRef = useRef<Map<string, { x: number, y: number }> | null>(null)

  useLayoutEffect(() => {
    if (isInitialized) {
      const nodes = getNodes()
      const edges = getEdges()
      const newNodes = getNodesWithPositions(nodes, edges)
      setNodes(newNodes)
      fitView({ nodes: newNodes })
    }
  }, [isInitialized, getNodes, getEdges, setNodes, fitView])

  // Re-layout when isolated path changes
  useEffect(() => {
    if (!isInitialized)
      return

    const allNodes = getNodes()
    const allEdges = getEdges()

    if (isolatedPath) {
      // Save current positions before re-layout
      if (!savedPositionsRef.current) {
        savedPositionsRef.current = new Map()
        for (const node of allNodes) {
          savedPositionsRef.current.set(node.id, { ...node.position })
        }
      }

      // Filter to only nodes in the isolated path
      const pathNodes = allNodes.filter(node =>
        isolatedPath.nodeKeys.has(node.id),
      )
      const pathEdges = allEdges.filter(edge =>
        isolatedPath.edgeIds.has(edge.id),
      )
      const nonPathNodes = allNodes.filter(node =>
        !isolatedPath.nodeKeys.has(node.id),
      )

      // Calculate new positions for path nodes
      const repositionedPathNodes = getNodesWithPositions(pathNodes, pathEdges)

      // Calculate bounding boxes to check for overlap and offset if needed
      if (nonPathNodes.length > 0 && repositionedPathNodes.length > 0) {
        // Get bounding box of non-path nodes
        let nonPathMinX = Infinity
        let nonPathMaxX = -Infinity
        let nonPathMinY = Infinity
        let nonPathMaxY = -Infinity
        for (const node of nonPathNodes) {
          const width = node.measured?.width ?? 200
          const height = node.measured?.height ?? 100
          nonPathMinX = Math.min(nonPathMinX, node.position.x)
          nonPathMaxX = Math.max(nonPathMaxX, node.position.x + width)
          nonPathMinY = Math.min(nonPathMinY, node.position.y)
          nonPathMaxY = Math.max(nonPathMaxY, node.position.y + height)
        }

        // Get bounding box of path nodes
        let pathMinX = Infinity
        let pathMaxX = -Infinity
        let pathMinY = Infinity
        let pathMaxY = -Infinity
        for (const node of repositionedPathNodes) {
          const width = node.measured?.width ?? 200
          const height = node.measured?.height ?? 100
          pathMinX = Math.min(pathMinX, node.position.x)
          pathMaxX = Math.max(pathMaxX, node.position.x + width)
          pathMinY = Math.min(pathMinY, node.position.y)
          pathMaxY = Math.max(pathMaxY, node.position.y + height)
        }

        // Check if bounding boxes overlap
        const horizontalOverlap = pathMinX < nonPathMaxX && pathMaxX > nonPathMinX
        const verticalOverlap = pathMinY < nonPathMaxY && pathMaxY > nonPathMinY

        if (horizontalOverlap && verticalOverlap) {
          // Offset path nodes below non-path nodes with some padding
          const offsetY = nonPathMaxY - pathMinY + 100
          for (const node of repositionedPathNodes) {
            node.position.y += offsetY
          }
        }
      }

      const newPositionsMap = new Map(
        repositionedPathNodes.map(n => [n.id, n.position]),
      )

      // Update only the path nodes' positions
      const updatedNodes = allNodes.map((node) => {
        const newPos = newPositionsMap.get(node.id)
        if (newPos) {
          return { ...node, position: newPos }
        }
        return node
      })

      setNodes(updatedNodes)
      requestAnimationFrame(() => {
        fitView({ nodes: repositionedPathNodes, duration: 300 })
      })
    }
    else if (savedPositionsRef.current) {
      // Restore original positions
      const updatedNodes = allNodes.map((node) => {
        const savedPos = savedPositionsRef.current!.get(node.id)
        if (savedPos) {
          return { ...node, position: savedPos }
        }
        return node
      })
      setNodes(updatedNodes)
      savedPositionsRef.current = null
      requestAnimationFrame(() => {
        fitView({ nodes: updatedNodes, duration: 300 })
      })
    }
  }, [isolatedPath, isInitialized, getNodes, getEdges, setNodes, fitView])

  return null
}
