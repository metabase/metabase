export const saveFormatPdf = async (
  nodes: NodeListOf<Element>,
  fileName: string,
  format: "a3" | "a4",
  orientation: "l" | "p",
) => {
  const exportFileName = `${fileName}.pdf`;
  const imageSize = {
    ["a4"]: {
      ["l"]: {
        w: 297,
        h: 210,
      },
      ["p"]: {
        w: 210,
        h: 297,
      },
    },
    ["a3"]: {
      ["l"]: {
        w: 420,
        h: 297,
      },
      ["p"]: {
        w: 297,
        h: 420,
      },
    },
  };

  if (!nodes.length) {
    console.warn("No nodes found for params");
    return;
  }

  const { default: jspdf } = await import("jspdf");
  const { default: html2canvas } = await import("html2canvas-pro");
  const pdf = new jspdf({ unit: "mm", format, orientation });

  const images = [...nodes].map(async node => {
    if (node && node instanceof HTMLElement) {
      return await html2canvas(node, {
        useCORS: true,
      });
    }
  });

  images
    .reduce(async (acc, imagePromise, index) => {
      const image = await imagePromise;
      const { w, h } = imageSize[format][orientation];
      if (image) {
        if (index === 0) {
          pdf.addImage(image, "PNG", 0, 0, w, h, "", "FAST", 0);
        } else {
          pdf
            .addPage(format, orientation)
            .addImage(image, "JPEG", 0, 0, w, h, "", "FAST", 0);
        }
      }
      return acc;
    }, Promise.resolve())
    .then(() => {
      pdf.save(exportFileName);
    });
};
