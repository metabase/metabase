import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/react";

export const PDFGenerator = Extension.create({
  name: "RyanIsScared",

  addCommands() {
    return {
      generatePDF:
        () =>
        async ({ editor }: { editor: Editor }) => {
          const { default: jspdf } = await import("jspdf");
          const pdf = new PDF("test", { jsPDF: jspdf });
          editor.state.doc.forEach((node) => {
            console.log({ node, type: node.type.name });

            switch (node.type.name) {
              case "paragraph": {
                pdf.addText(node.textContent);
                break;
              }
              case "heading": {
                pdf.addHeading(node.textContent, { level: node.attrs.level });
                break;
              }
              case "bulletList": {
                const content = node.content.content.map((n) => n.textContent);
                pdf.addBulletList(content);
                break;
              }
              case "orderedList": {
                const content = node.content.content.map((n) => n.textContent);
                pdf.addOrderedList(content);
                break;
              }
              default: {
                pdf.addText(node.textContent);
              }
            }
          });
          pdf.output();
        },
    };
  },
});

class PDF {
  constructor(
    name,
    {
      padding = [20, 25, 20, 25],
      width = 210,
      height = 297,
      defaultFontSize = 12,
      debug = false,
      jsPDF,
    },
  ) {
    this._name = name;
    this._width = width;
    this._height = height;
    this._padding = padding;
    this._defaultFontSize = defaultFontSize;
    this._x = padding[1];
    this._y = padding[0];
    this._maxWidth = width - (padding[3] + padding[1]) - 1;
    this._doc = jsPDF();
    this._doc.setFont("helvetica");
    this._pages = 1;
    this._debug = debug;
    if (this._debug) {
      this._doc.line(padding[3], padding[0], width - padding[1], padding[0]);
      this._doc.line(
        width - padding[1],
        padding[0],
        width - padding[1],
        height - padding[2],
      );
      this._doc.line(
        width - padding[1],
        height - padding[2],
        padding[3],
        height - padding[2],
      );
      this._doc.line(padding[3], height - padding[2], padding[3], padding[0]);
    }
  }

  // Getter
  get doc() {
    return this._doc;
  }

  get x() {
    return this._x;
  }

  get y() {
    return this._y;
  }

  // Setter

  setPosition(newX, newY) {
    if (newX) {
      this._x = newX;
    }

    if (newY) {
      this._y = newY;
    }
  }

  resetPosition() {
    this._x = this._padding[3];
    this._y = this._padding[0];
  }

  addPage() {
    this.resetPosition();
    this._doc.addPage();
    this._pages++;
  }

  // Methods

  addY(num) {
    this._y += num;
  }

  /**
   *
   * @param {string} text Text
   * @param {Object} options Additional options
   * @param {number?} options.size Font size
   * @param {string?} options.color Color of the text
   * @param {number?} options.maxWidth Defines the maximum Width, that the text should get wrapped to. If maxWidth is bigger than the available space, the maximum is the available space
   * @param {number?} options.indent Indention of the text. Also has influence on maxWidth
   */
  addText(
    text,
    {
      size = this._defaultFontSize,
      movePosition = true,
      color = "black",
      fontWeight = "normal",
      maxWidth,
      indent = 0,
      align = "left",
      marginBottom = 4,
    } = {},
  ) {
    this._doc.setTextColor(color);
    this._doc.setFontSize(size);
    this._doc.setFont("helvetica", "normal", fontWeight);

    let lineHeight =
      this._doc.getLineHeight(text) / this._doc.internal.scaleFactor;

    let blockMaxWidth =
      maxWidth <= this._maxWidth - indent
        ? maxWidth - 1
        : this._maxWidth - indent; // somehow we need to subtract 1 so the padding is not crossed
    let splittedText = this._doc.splitTextToSize(text, blockMaxWidth);

    let lineCount = splittedText.length; // splitted text is a string array

    if (this._y + lineHeight > this._height - this._padding[2]) {
      this.addPage();
      this.resetPosition();
    } else {
      this._y += lineHeight;
    }

    this._doc.text(this._x + indent, this._y, splittedText, {
      align: align,
      maxWidth: blockMaxWidth,
    });

    // Add the block height, which is the amount of lines minus one multiplied by the line height
    // Minus one, because the starting point is from the bottom of the text and we already added the first line
    if (movePosition) {
      this._y += lineHeight * (lineCount - 1) + marginBottom;
    } else {
      this._y -= lineHeight;
    }
  }

  addHeading(text, { level }) {
    const levelSize = {
      "1": 24,
      "2": 18,
    };

    const marginSize = {
      "1": 6,
      "2": 4,
    };

    this.addText(text, {
      size: levelSize[level],
      fontWeight: "bold",
      marginBottom: marginSize[level],
    });
  }

  addBulletList(text: string[]) {
    text.forEach((t) => {
      const { x, y } = this;
      this._doc.circle(x + 2, y + 3.5, 0.5);

      this.addText(t, { indent: 6 });
    });
  }

  addOrderedList(text: string[]) {
    text.forEach((t, index) => {
      const { x, y } = this;
      this.addText(`${index + 1}.`, { movePosition: false });

      this.addText(t, { indent: 6 });
    });
  }

  drawLineIfDebug = (color, size = 100) => {
    if (this._debug) {
      this._doc.setDrawColor(color);
      this._doc.line(this._x, this._y, this._x + size, this._y);
    }
  };

  output() {
    window.open(this._doc.output("bloburl"), "_blank");
    // this._doc.save(this._name);
  }
}
