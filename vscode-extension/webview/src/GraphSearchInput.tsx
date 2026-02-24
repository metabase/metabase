import { useState, useMemo, useRef, useEffect } from "react";
import { useReactFlow } from "@xyflow/react";
import type { GraphViewNode } from "../../src/shared-types";
import { getNodeIcon } from "./graph-utils";
import type { GraphNodeType } from "./GraphNode";

interface GraphSearchInputProps {
  nodes: GraphViewNode[];
}

export function GraphSearchInput({ nodes }: GraphSearchInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { fitView, getNodes } = useReactFlow<GraphNodeType>();

  const filteredNodes = useMemo(() => {
    if (!searchText.trim()) return nodes;
    const query = searchText.toLowerCase();
    return nodes.filter((node) => node.name.toLowerCase().includes(query));
  }, [nodes, searchText]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as HTMLElement)
      ) {
        setIsOpen(false);
        setSearchText("");
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const handleSelect = (nodeKey: string) => {
    const flowNodes = getNodes();
    const selectedNode = flowNodes.find((node) => node.id === nodeKey);
    if (selectedNode) {
      fitView({ nodes: [selectedNode], duration: 300 });
    }
    setIsOpen(false);
    setSearchText("");
  };

  if (!isOpen) {
    return (
      <button
        className="graph-search-button"
        onClick={() => setIsOpen(true)}
        title="Jump to an item on the graph"
      >
        🔍
      </button>
    );
  }

  return (
    <div className="graph-search-dropdown" ref={dropdownRef}>
      <div className="graph-search-input-wrapper">
        <span className="graph-search-icon">🔍</span>
        <input
          ref={inputRef}
          type="text"
          className="graph-search-input"
          placeholder="Jump to an item on the graph"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          onBlur={() => {
            setTimeout(() => {
              setIsOpen(false);
              setSearchText("");
            }, 200);
          }}
        />
      </div>
      {filteredNodes.length > 0 && (
        <div className="graph-search-results">
          {filteredNodes.slice(0, 50).map((node) => (
            <button
              key={node.key}
              className="graph-search-result-item"
              onMouseDown={(event) => {
                event.preventDefault();
                handleSelect(node.key);
              }}
            >
              <span className="graph-search-result-icon">
                {getNodeIcon(node)}
              </span>
              <span className="graph-search-result-name">{node.name}</span>
            </button>
          ))}
          {filteredNodes.length > 50 && (
            <div className="graph-search-more">
              ...and {filteredNodes.length - 50} more
            </div>
          )}
        </div>
      )}
      {filteredNodes.length === 0 && searchText.trim() && (
        <div className="graph-search-results">
          <div className="graph-search-empty">No results found</div>
        </div>
      )}
    </div>
  );
}
