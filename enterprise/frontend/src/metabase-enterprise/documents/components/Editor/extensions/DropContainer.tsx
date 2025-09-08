import cx from "classnames";
import { Node } from "@tiptap/core";
import { Plugin } from "prosemirror-state";

import S from "./DropContent.module.css";

export const DropContainer = Node.create({
  name: "dropContainer",
  group: "block",
  content: "cardEmbed*",
  atom: true,
  draggable: false,
  selectable: false,

  parseHTML() {
    return [
      {
        tag: `div[data-type="${DropContainer.name}"]`,
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      {
        ...HTMLAttributes,
      },
      0,
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            dragstart(view, event) {
              console.log("drag start");
              const coords = { left: event.clientX, top: event.clientY };
              const pos = view.posAtCoords(coords);
              if (pos && pos.inside !== -1) {
                const node = view.state.doc.nodeAt(pos.inside); // Get the node
                console.log("dragging node:", { node });
                if (node && node.type.spec.draggable) {
                  // Check if the node is configured as draggable
                  event.dataTransfer.setData("text/plain", "ProseMirrorNode"); // Indicate custom drag data
                  // Store node data for drop handling
                  view.draggingNode = node;
                  view.draggingNodePos = pos;
                  return true; // Prevent default browser drag
                }
              }
            },

            drop(view, event) {
              console.log("drop");
              if (view.draggingNode) {
                const dropPos = view.posAtCoords({
                  left: event.clientX,
                  top: event.clientY,
                });

                if (dropPos) {
                  const node = view.state.doc.nodeAt(dropPos.inside);

                  console.log("dropped onto", { node });

                  if (node && node.type.name === "cardEmbed") {
                    // Handle the drop event specifically for 'myCustomDropTargetNode'
                    // Access dropped data using event.dataTransfer
                    const data = event.dataTransfer?.getData("text/plain"); // Or other data types
                    console.log(
                      "Dropped on custom node:",
                      node.type.name,
                      "Data:",
                      data,
                      view.draggingNode,
                    );

                    return true;
                  }
                }
              }
              return false;
            },
          },
          handleDrop(view, event, slice, moved) {
            console.log({
              view,
              event,
              slice,
              moved,
            });

            // const coords = { left: event.clientX, top: event.clientY };
            // const pos = view.posAtCoords(coords);

            // console.log(pos);

            // if (pos && pos.inside !== -1) {
            //   const node = view.state.doc.nodeAt(pos.inside);

            //   if (node && node.type.name === "cardEmbed") {
            //     // Handle the drop event specifically for 'myCustomDropTargetNode'
            //     // Access dropped data using event.dataTransfer
            //     const data = event.dataTransfer.getData("text/plain"); // Or other data types
            //     console.log(
            //       "Dropped on custom node:",
            //       node.type.name,
            //       "Data:",
            //       data,
            //     );

            //     // Perform a transaction to update the document based on the dropped data
            //     // For example, insert content, change node attributes, etc.
            //     // view.dispatch(view.state.tr.insert(pos.pos, mySchema.text(data)));

            //     return true; // Indicate that the drop was handled
            //   }
            // }
          },
        },
      }),
    ];
  },

  addNodeView() {
    return ({
      editor,
      view,
      node,
      getPos,
      HTMLAttributes,
      decorations,
      extension,
    }) => {
      // return new CustomNodeView(node, view, getPos);
      const isDragging = node.attrs.isDragOver;

      const dom = document.createElement("div");

      console.log({ isDragging });
      dom.className = cx(S.wrapper, { [S.dragOver]: isDragging });

      const content = document.createElement("div");

      dom.append(content);

      return {
        dom,
        contentDOM: content,
      };
    };
  },
});

class CustomNodeView {
  constructor(node, view, getPos) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;

    // Create a container element for the node view.
    this.dom = document.createElement("div");
    this.contentDom = document.createElement("div");
    this.dom.style.border = "1px solid #ccc";
    this.dom.style.padding = "10px";
    this.dom.style.margin = "10px 0";

    // Render the node content
    this.contentDOM = document.createElement("div");
    this.contentDOM.textContent = node.attrs.content || "My Custom Node";
    this.dom.appendChild(this.contentDOM);

    // Set up drag & drop event listeners
    this.dom.addEventListener("dragenter", this.handleDragEnter.bind(this));
    this.dom.addEventListener("dragover", this.handleDragOver.bind(this));
    this.dom.addEventListener("dragleave", this.handleDragLeave.bind(this));
    this.dom.addEventListener("drop", this.handleDrop.bind(this));
  }

  handleDragEnter(event) {
    event.preventDefault(); // Necessary to allow the drop
    this.dom.style.border = "2px dashed blue";
    console.log("Drag entered the node");
  }

  handleDragOver(event) {
    event.preventDefault(); // Must call this continuously for a valid drop target
    // Optionally, update styling or state here
    console.log("Dragging over the node");
    return false;
  }

  handleDragLeave(event) {
    this.dom.style.border = "1px solid #ccc";
    console.log("Drag left the node");
  }

  handleDrop(event) {
    event.preventDefault();
    this.dom.style.border = "1px solid #ccc";

    // Retrieve data from the dragged element if any.
    const dataStr = event.dataTransfer.getData("application/json");
    if (dataStr) {
      const data = JSON.parse(dataStr);
      console.log("Dropped data:", data);

      // For example, update the node content with the dropped data.
      const pos = this.getPos();
      const tr = this.view.state.tr.setNodeMarkup(pos, undefined, {
        ...this.node.attrs,
        content: data.content,
      });
      this.view.dispatch(tr);
    }
    console.log("Drop handled");
  }

  // (Optional) Update the node view if the node is updated.
  update(node) {
    if (node.type !== this.node.type) {
      return false;
    }
    this.node = node;
    // Update the rendered content if necessary.
    this.contentDOM.textContent = node.attrs.content || "My Custom Node";
    return true;
  }

  destroy() {
    // Clean up event listeners if needed.
    this.dom.removeEventListener("dragenter", this.handleDragEnter);
    this.dom.removeEventListener("dragover", this.handleDragOver);
    this.dom.removeEventListener("dragleave", this.handleDragLeave);
    this.dom.removeEventListener("drop", this.handleDrop);
  }
}
