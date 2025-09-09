import cx from "classnames";
import { Editor, Node } from "@tiptap/core";
import { Plugin } from "prosemirror-state";

import S from "./DropContent.module.css";

export const DropContainer = Node.create({
  name: "dropContainer",
  group: "block",
  content: "cardEmbed*",
  atom: true,
  draggable: false,
  selectable: false,

  addAttributes() {
    return {
      isDragging: {
        default: false,
        parseHTML: (element) => {
          console.log("parsing element", element);
          return element.getAttribute("isDragging");
        },
      },
    };
  },

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
            // dragstart(view, event) {
            //   console.log("drag start");
            //   const coords = { left: event.clientX, top: event.clientY };
            //   const pos = view.posAtCoords(coords);
            //   if (pos && pos.inside !== -1) {
            //     const node = view.state.doc.nodeAt(pos.inside); // Get the node
            //     console.log("dragging node:", { node });
            //     if (node && node.type.spec.draggable) {
            //       // Check if the node is configured as draggable
            //       event.dataTransfer.setData("text/plain", "ProseMirrorNode"); // Indicate custom drag data
            //       // Store node data for drop handling
            //       view.draggingNode = node;
            //       view.draggingNodePos = pos;
            //       return true; // Prevent default browser drag
            //     }
            //   }
            // },
            // dragenter(view, event) {
            //   event.preventDefault();
            //   const coords = { left: event.clientX, top: event.clientY };
            //   const pos = view.posAtCoords(coords);
            //   if (pos && pos.inside !== -1) {
            //     const node = view.state.doc.nodeAt(pos.inside); // Get the node
            //     if (node.type.name === "dropContainer") {
            //       const nodeElement = view.nodeDOM(pos.inside);
            //       // nodeElement.classList.add("dragOver");
            //       console.log("drag enter");
            //       return true;
            //     }
            //     console.log("seriously, it's true");
            //     return true;
            //   }
            //   console.log("for the love of god, leave it alone");
            //   return true;
            // },
            // dragover(view, event) {
            //   event.preventDefault();
            //   return true;
            // },
            // drop(view, event) {
            //   console.log("drop");
            //   if (view.draggingNode) {
            //     const dropPos = view.posAtCoords({
            //       left: event.clientX,
            //       top: event.clientY,
            //     });
            //     if (dropPos) {
            //       const node = view.state.doc.nodeAt(dropPos.inside);
            //       console.log("dropped onto", { node });
            //       if (node && node.type.name === "cardEmbed") {
            //         // Handle the drop event specifically for 'myCustomDropTargetNode'
            //         // Access dropped data using event.dataTransfer
            //         const data = event.dataTransfer?.getData("text/plain"); // Or other data types
            //         console.log(
            //           "Dropped on custom node:",
            //           node.type.name,
            //           "Data:",
            //           data,
            //           view.draggingNode,
            //         );
            //         return true;
            //       }
            //     }
            //   }
            //   return false;
            // },
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
      console.log({ HTMLAttributes });
      node;
      return new CustomNodeView(node, view, getPos, editor);
      // const isDragging = node.attrs.isDragOver;

      // const dom = document.createElement("div");

      // console.log({ isDragging });
      // dom.className = cx(S.wrapper, { [S.dragOver]: isDragging });

      // const content = document.createElement("div");

      // dom.append(content);

      // return {
      //   dom,
      //   contentDOM: content,
      // };
    };
  },
});

class CustomNodeView {
  dom: HTMLDivElement;
  node: Node;

  constructor(node, view, getPos, editor: Editor) {
    console.log("constructing");
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.dom = document.createElement("div");
    this.dom.className = S.root;
    this.contentDOM = document.createElement("div");
    this.contentDOM.className = S.wrapper;
    this.dom.appendChild(this.contentDOM);

    this.dom.addEventListener("dragenter", (e) => {
      console.log("dragenter", e.target);
      e.preventDefault();
      // this.dom.setAttribute("isDragging", "true");
      const trans = editor.state.tr.setNodeMarkup(getPos(), undefined, {
        isDragging: true,
      });
      view.dispatch(trans);
    });
    this.dom.addEventListener("dragleave", (e) => {
      console.log("dragleave", e.target);
      // this.contentDOM.classList.remove("drag-over");
      const trans = editor.state.tr.setNodeMarkup(getPos(), undefined, {
        isDragging: false,
      });
      view.dispatch(trans);
    });
    this.dom.addEventListener("drop", (e) => {
      console.log("drop", e.target);
      // this.contentDOM.classList.remove("drag-over");
      const trans = editor.state.tr.setNodeMarkup(getPos(), undefined, {
        isDragging: false,
      });
      view.dispatch(trans);
    });
    // ... other event listeners ...
  }

  update(newNode) {
    console.log("update", { newNode });
    if (newNode.type !== this.node.type) return false;

    if (newNode.attrs.isDragging) {
      this.dom.classList.add(S.isDragging);
    } else {
      this.dom.classList.remove(S.isDragging);
    }
    this.node = newNode;
    // Update contentDOM, etc.
    return true;
  }
}
