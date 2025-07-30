import { Extension } from "@tiptap/core";
import type { Editor, Node } from "@tiptap/react";

import { convertQuestionToPng } from "metabase-enterprise/reports/components/exports";
import { Icons } from "metabase/ui";

const svgToPNG = async (datauri: string) => {
  return new Promise((res) => {
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.height = 300;
      canvas.width = 300;
      canvas.getContext("2d")?.drawImage(img, 0, 0, 300, 300);
      res(canvas.toDataURL());
    };

    img.src = datauri;
  });
};

export const PDFGenerator = Extension.create({
  name: "RyanIsScared",

  addCommands() {
    return {
      generatePDF:
        () =>
        async ({ editor }: { editor: Editor }) => {
          const { default: jspdf } = await import("jspdf");
          const pdf = new PDF("test", { jsPDF: jspdf });
          await walkNodes(editor.state.doc, pdf);

          setTimeout(() => {
            pdf.output();
          }, 300);
        },
    };
  },
});

const walkNodes = async (root: Node, pdf: PDF) => {
  for (const node of root.children) {
    console.log({ nodeType: node.type.name, node });
    switch (node.type.name) {
      case "text": {
        pdf.addInlineText(node.text);
        break;
      }
      case "listItem": {
        await walkNodes(node, pdf);
        break;
      }
      case "hardBreak": {
        pdf.endParagraph();
        break;
      }
      case "smartLink": {
        const { text, icon, url } = node.attrs;

        const iconSVG = Icons[icon].source;

        const datauri = await svgToPNG(
          `data:image/svg+xml;base64,${btoa(iconSVG)}`,
        );

        pdf.addSVGInline(datauri);

        const origin = new URL(window.location).origin;

        pdf.addInlineText(text, { isLink: true, url: `${origin}${url}` });
        break;
      }
      case "paragraph": {
        pdf.startParagraph();
        await walkNodes(node, pdf);
        pdf.endParagraph();
        break;
      }
      case "heading": {
        const level = node.attrs.level || 3;
        pdf.startHeading({ level });
        await walkNodes(node, pdf);
        //pdf.addHeading(node.textContent, { level: node.attrs.level });
        pdf.endParagraph({ margin: level === "1" ? 6 : 4 });
        break;
      }
      case "bulletList": {
        pdf.startList();
        for (const child of node.children) {
          pdf.addBullet();
          await walkNodes(child, pdf);
        }

        pdf.endList();
        break;
      }
      case "orderedList": {
        pdf.startList();
        let index = 1;
        for (const child of node.children) {
          pdf.addOrder(index.toString());
          await walkNodes(child, pdf);
          index++;
        }

        pdf.endList();
        break;
      }
      case "cardEmbed": {
        const { id } = node.attrs;
        const dataUri = await convertQuestionToPng(id);
        pdf.addImageFromDataUri(dataUri);
        break;
      }
      default: {
        console.log("Panic! I don't know what this is");
        console.log({ node, nodeType: node.type.name });
      }
    }
  }
};

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

    this._fontSize = defaultFontSize;
    this._fontWeight = "normal";
    this._fontStyle = "normal";
    this._indentSize = 6;
    this._currentIndent = 0;
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

  get maxWidth() {
    return this._maxWidth;
  }

  get lineStart() {
    return this._padding[3];
  }

  get fontInfo() {
    return {
      size: this._fontSize,
      weight: this._fontWeight,
      name: "helvetica",
      style: this._fontStyle,
    };
  }

  // Setter

  setFont({ size, weight }) {
    this._fontSize = size;
    this._fontWeight = weight;
  }

  setPosition(newX, newY) {
    if (newX) {
      this._x = newX;
    }

    if (newY) {
      this._y = newY;
    }
  }

  resetPosition() {
    console.log("resetting position");
    this._x = this._padding[3] + this._currentIndent;
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

  addInlineText(
    text: string,
    {
      movePosition = true,
      color = "black",
      align = "left",
      isLink = false,
      url = "",
    } = {},
  ) {
    const indent = this._currentIndent;
    const font = this.fontInfo;

    this._doc.setTextColor(color);
    this._doc.setFontSize(font.size);
    this._doc.setFont(font.name, font.style, font.weight);

    let lineHeight =
      this._doc.getLineHeight(text) / this._doc.internal.scaleFactor;

    if (this._x <= this.lineStart) {
      this._y += lineHeight;
      this._x += indent;

      console.log("does this kick in?", { x: this._x, indent });
    }

    // Figure out what can be added to the rest of the current line:

    const firstLineRemainingWidth = this.maxWidth + this._padding[3] - this._x;
    const firstLineSplittedText = this._doc.splitTextToSize(
      text,
      firstLineRemainingWidth,
    );

    if (isLink) {
      this._doc.textWithLink(
        firstLineSplittedText[0],
        this._x,
        this._y,

        {
          align: align,
          maxWidth: firstLineRemainingWidth,
          url,
        },
      );
    } else {
      this._doc.text(this._x, this._y, firstLineSplittedText[0], {
        align: align,
        maxWidth: firstLineRemainingWidth,
      });
    }

    if (firstLineSplittedText.length === 1) {
      const width = this._doc.getTextWidth(firstLineSplittedText[0]);
      this._x += width;
      console.log({ x: this._x, width });
      return;
    }

    // If we get here, we have more text to add. Start a new line
    this._y += lineHeight;
    this._x = this._padding[3] + indent;

    //Get the remaining text
    const remainingText = text.slice(firstLineSplittedText[0].length).trim();

    let blockMaxWidth = this._maxWidth - indent; // somehow we need to subtract 1 so the padding is not crossed
    let splittedText = this._doc.splitTextToSize(remainingText, blockMaxWidth);

    let lineCount = splittedText.length; // splitted text is a string array

    if (this._y + lineHeight > this._height - this._padding[2]) {
      this.addPage();
      this.resetPosition();
    }

    console.log({ splittedText });

    if (isLink) {
      console.log("text width", this._doc.getTextWidth(splittedText[0]));
      this._doc.textWithLink(splittedText[0], this._x, this._y, {
        align: align,
        maxWidth: blockMaxWidth,
        url,
      });
    } else {
      this._doc.text(this._x, this._y, splittedText, {
        align: align,
        maxWidth: blockMaxWidth,
      });
    }

    // Add the block height, which is the amount of lines minus one multiplied by the line height
    // Minus one, because the starting point is from the bottom of the text and we already added the first line
    if (movePosition) {
      const lastLineText = splittedText[splittedText.length - 1];
      this._y += lineHeight * (lineCount - 1);
      this._x += this._doc.getTextWidth(lastLineText);
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

  addBullet() {
    const { y } = this;
    this._doc.circle(this.lineStart + this._currentIndent - 2, y + 3.5, 0.5);
  }

  addOrder(index) {
    const { y } = this;
    const lineHeight =
      this._doc.getLineHeight("I'm helping") / this._doc.internal.scaleFactor;

    this._doc.text(
      this.lineStart + this._currentIndent - 4,
      y + lineHeight,
      `${index}.`,
    );
  }

  addOrderedList(text: string[]) {
    text.forEach((t, index) => {
      const { x, y } = this;
      this.addText(`${index + 1}.`, { movePosition: false });

      this.addText(t, { indent: 6 });
    });
  }

  addImageFromDataUri(datauri, { marginBottom = 6 } = {}) {
    const props = this._doc.getImageProperties(datauri);

    const { x, y, maxWidth } = this;

    const { height, width, fileType } = props;

    const documentFactor = maxWidth / width;

    const scaledHeight = height * documentFactor;
    const scaledWidth = width * documentFactor;

    this._doc.addImage(datauri, fileType, x, y, scaledWidth, scaledHeight);
    this._y += scaledHeight + marginBottom;
  }

  addSVGInline(datauri) {
    const props = this._doc.getImageProperties(datauri);

    console.log({
      height: props.height,
      width: props.width,
    });

    const size =
      this._doc.getLineHeight("I'm helping") / this._doc.internal.scaleFactor;

    this._doc.addImage(datauri, this._x, this._y - size + 0.5, size, size);

    this._x += size;
  }

  drawLineIfDebug = (color, size = 100) => {
    if (this._debug) {
      this._doc.setDrawColor(color);
      this._doc.line(this._x, this._y, this._x + size, this._y);
    }
  };

  startParagraph() {
    this.setFont({ size: 12, weight: "normal" });
  }

  startHeading({ level = "3" }: { level: "1" | "2" | "3" }) {
    const levelSize = {
      "1": 24,
      "2": 18,
      "3": 16,
    };

    this.setFont({
      size: levelSize[level],
      weight: "bold",
    });
  }

  endParagraph({ margin = 4 } = {}) {
    this._x = this.lineStart;
    this._y += margin;
  }

  startList() {
    this._currentIndent += this._indentSize;
  }

  endList() {
    this._currentIndent -= this._indentSize;
  }

  output() {
    window.open(this._doc.output("bloburi"), "_blank");

    // this._doc.save(this._name);
  }
}
