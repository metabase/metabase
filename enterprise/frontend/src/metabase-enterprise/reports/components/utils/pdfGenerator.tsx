import { marked } from "marked";
import { t } from "ttag";

// Import jsPDF which is already available in the project
declare const jsPDF: any;

// Dynamically import jsPDF to avoid CSP issues
const loadJsPDF = async () => {
  if (typeof window !== 'undefined' && !(window as any).jsPDF) {
    // Load jsPDF dynamically
    const jsPDFModule = await import('jspdf');
    (window as any).jsPDF = jsPDFModule.jsPDF || jsPDFModule.default;
  }
  return (window as any).jsPDF;
};

// PDF styling constants for jsPDF
const PDF_CONFIG = {
  margins: { top: 30, left: 20, right: 20, bottom: 40 },
  fontSize: {
    title: 24,
    heading1: 18,
    heading2: 16,
    heading3: 14,
    paragraph: 12,
    code: 10,
  },
  lineHeight: 1.5,
  pageWidth: 210, // A4 width in mm
  pageHeight: 297, // A4 height in mm
  imageMaxWidth: 160, // Max image width in mm (increased)
  imageMaxHeight: 120, // Max image height in mm (increased)
};

// Interface for parsed markdown tokens
interface MarkdownToken {
  type: string;
  text?: string;
  href?: string;
  title?: string;
  tokens?: MarkdownToken[];
  items?: MarkdownToken[];
  depth?: number;
  raw?: string;
}

// Helper function to check if content will fit on current page
const checkPageBreak = (pdf: any, currentY: number, contentHeight: number): number => {
  const { margins, pageHeight } = PDF_CONFIG;
  const availableSpace = pageHeight - margins.bottom - currentY;
  
  if (contentHeight > availableSpace) {
    pdf.addPage();
    return margins.top;
  }
  return currentY;
};

// Helper function to calculate image dimensions maintaining aspect ratio
const calculateImageDimensions = (dataUrl: string): Promise<{ width: number; height: number }> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { imageMaxWidth, imageMaxHeight } = PDF_CONFIG;
      const { margins, pageWidth } = PDF_CONFIG;
      const maxWidth = pageWidth - margins.left - margins.right;
      
      // Calculate aspect ratio
      const aspectRatio = img.width / img.height;
      
      let targetWidth = Math.min(imageMaxWidth, maxWidth * 0.8); // Use 80% of available width
      let targetHeight = targetWidth / aspectRatio;
      
      // If height is too large, constrain by height instead
      if (targetHeight > imageMaxHeight) {
        targetHeight = imageMaxHeight;
        targetWidth = targetHeight * aspectRatio;
      }
      
      resolve({ width: targetWidth, height: targetHeight });
    };
    img.onerror = () => {
      // Fallback dimensions if image can't load
      resolve({ width: imageMaxWidth * 0.6, height: imageMaxHeight * 0.6 });
    };
    img.src = dataUrl;
  });
};

// Helper function to process markdown tokens into PDF content
const processTokensForPDF = async (pdf: any, tokens: MarkdownToken[], yPosition: number): Promise<number> => {
  let currentY = yPosition;
  const { margins, fontSize, lineHeight, pageWidth, pageHeight } = PDF_CONFIG;
  const maxWidth = pageWidth - margins.left - margins.right;

  for (const token of tokens) {
    // Debug: log all tokens to see what we're processing
    console.log("Processing token:", token.type, token.href ? `href: ${token.href.substring(0, 50)}...` : '');
    
    // Estimate content height for better page break decisions
    let estimatedHeight = 0;
    switch (token.type) {
      case "heading":
        estimatedHeight = (token.depth === 1 ? fontSize.heading1 : token.depth === 2 ? fontSize.heading2 : fontSize.heading3) * lineHeight + 10;
        break;
      case "paragraph":
        estimatedHeight = fontSize.paragraph * lineHeight * 2; // Estimate 2 lines
        break;
      case "image":
        estimatedHeight = PDF_CONFIG.imageMaxHeight + 20; // Max possible image height + margins
        break;
      default:
        estimatedHeight = fontSize.paragraph * lineHeight;
    }
    
    // Check if we need a page break before adding content
    currentY = checkPageBreak(pdf, currentY, estimatedHeight);

    switch (token.type) {
      case "heading": {
        const headingFontSize = token.depth === 1 ? fontSize.heading1 
                              : token.depth === 2 ? fontSize.heading2 
                              : fontSize.heading3;
        
        pdf.setFontSize(headingFontSize);
        pdf.setFont("helvetica", "bold");
        
        currentY += 10; // Add space before heading
        pdf.text(token.text || "", margins.left, currentY);
        currentY += headingFontSize * lineHeight;
        break;
      }

      case "paragraph": {
        pdf.setFontSize(fontSize.paragraph);
        pdf.setFont("helvetica", "normal");
        
        if (token.tokens) {
          // Check for images within paragraph tokens first
          const hasImages = token.tokens.some(t => t.type === 'image');
          
          if (hasImages) {
            // Process each sub-token individually to handle images properly
            currentY = await processTokensForPDF(pdf, token.tokens, currentY);
          } else {
            // Process as regular text paragraph
            let paragraphText = "";
            for (const subToken of token.tokens) {
              paragraphText += subToken.text || "";
            }
            
            // Split text into lines that fit the page width
            const lines = pdf.splitTextToSize(paragraphText, maxWidth);
            for (const line of lines) {
              pdf.text(line, margins.left, currentY);
              currentY += fontSize.paragraph * lineHeight;
            }
          }
        } else if (token.text) {
          const lines = pdf.splitTextToSize(token.text, maxWidth);
          for (const line of lines) {
            pdf.text(line, margins.left, currentY);
            currentY += fontSize.paragraph * lineHeight;
          }
        }
        currentY += 5; // Add space after paragraph
        break;
      }

      case "list": {
        pdf.setFontSize(fontSize.paragraph);
        pdf.setFont("helvetica", "normal");
        
        if (token.items) {
          for (const item of token.items) {
            const bulletText = `• ${item.text || ""}`;
            const lines = pdf.splitTextToSize(bulletText, maxWidth - 10);
            for (const line of lines) {
              pdf.text(line, margins.left + 10, currentY);
              currentY += fontSize.paragraph * lineHeight;
            }
          }
        }
        currentY += 5; // Add space after list
        break;
      }

      case "code": {
        pdf.setFontSize(fontSize.code);
        pdf.setFont("courier", "normal");
        
        // Add a light gray background effect by drawing a rectangle
        const textHeight = fontSize.code * lineHeight;
        pdf.setFillColor(245, 245, 245);
        pdf.rect(margins.left - 2, currentY - textHeight + 2, maxWidth + 4, textHeight + 2, 'F');
        
        pdf.text(token.text || "", margins.left, currentY);
        currentY += textHeight + 5;
        break;
      }

      case "blockquote": {
        pdf.setFontSize(fontSize.paragraph);
        pdf.setFont("helvetica", "italic");
        
        // Draw a vertical line for blockquote
        pdf.setDrawColor(221, 221, 221);
        pdf.line(margins.left, currentY - 5, margins.left, currentY + 15);
        
        if (token.tokens) {
          const quoteY = await processTokensForPDF(pdf, token.tokens, currentY);
          currentY = quoteY + 5;
        } else if (token.text) {
          const lines = pdf.splitTextToSize(token.text, maxWidth - 15);
          for (const line of lines) {
            pdf.text(line, margins.left + 15, currentY);
            currentY += fontSize.paragraph * lineHeight;
          }
        }
        break;
      }

      case "image": {
        // Handle embedded images (data URLs from the report charts)
        if (token.href && token.href.startsWith("data:image")) {
          try {
            // Debug: log the data URL to see if it's valid
            console.log("Adding image to PDF:", token.href.substring(0, 100) + "...");
            
            // Calculate proper dimensions maintaining aspect ratio
            const dimensions = await calculateImageDimensions(token.href);
            
            // Check if we need a page break for this image
            currentY = checkPageBreak(pdf, currentY, dimensions.height + 20);
            
            // Determine image format from data URL
            let format = 'JPEG'; // default
            if (token.href.includes('data:image/png')) {
              format = 'PNG';
            } else if (token.href.includes('data:image/jpeg') || token.href.includes('data:image/jpg')) {
              format = 'JPEG';
            } else if (token.href.includes('data:image/webp')) {
              format = 'WEBP';
            }
            
            // Center the image horizontally
            const xPosition = margins.left + (maxWidth - dimensions.width) / 2;
            
            console.log(`Adding image: ${dimensions.width}x${dimensions.height} at position ${xPosition}, ${currentY}`);
            
            pdf.addImage(
              token.href, 
              format, 
              xPosition, 
              currentY, 
              dimensions.width, 
              dimensions.height,
              undefined, // alias
              'MEDIUM' // compression
            );
            
            currentY += dimensions.height + 15; // Add space after image
            console.log("Successfully added image to PDF");
          } catch (error) {
            // Log the error for debugging
            console.error("Failed to add image to PDF:", error, token.href?.substring(0, 100));
            
            // Fallback: show alt text if image fails to load
            pdf.setFontSize(fontSize.paragraph);
            pdf.setFont("helvetica", "italic");
            const altText = t`[Image: ${token.title || token.text || t`Image`}] (Failed to load)`;
            pdf.text(altText, margins.left, currentY);
            currentY += fontSize.paragraph * lineHeight + 10;
          }
        } else {
          // For other image URLs, show alt text
          pdf.setFontSize(fontSize.paragraph);
          pdf.setFont("helvetica", "italic");
          const altText = t`[Image: ${token.title || token.text || t`Image`}]`;
          pdf.text(altText, margins.left, currentY);
          currentY += fontSize.paragraph * lineHeight + 10;
        }
        break;
      }

      case "text": {
        pdf.setFontSize(fontSize.paragraph);
        pdf.setFont("helvetica", "normal");
        pdf.text(token.text || "", margins.left, currentY);
        currentY += fontSize.paragraph * lineHeight;
        break;
      }

      default:
        // For unhandled types, try to render text if available
        if (token.text) {
          pdf.setFontSize(fontSize.paragraph);
          pdf.setFont("helvetica", "normal");
          pdf.text(token.text, margins.left, currentY);
          currentY += fontSize.paragraph * lineHeight;
        }
        break;
    }
  }

  return currentY;
};

/**
 * Generate PDF from markdown content using jsPDF (CSP-compliant)
 * @param markdown - The markdown string with embedded images as data URLs
 * @param title - Optional title for the PDF document
 * @returns Promise<Blob> - The generated PDF as a blob
 */
export const generatePdfFromMarkdown = async (
  markdown: string,
  title?: string
): Promise<Blob> => {
  try {
    // Load jsPDF
    const jsPDFClass = await loadJsPDF();
    
    if (!jsPDFClass) {
      throw new Error("Failed to load jsPDF library");
    }

    // Configure marked options
    marked.setOptions({
      breaks: true,
      gfm: true,
    });

    // Parse markdown to tokens
    const tokens = marked.lexer(markdown) as MarkdownToken[];

    // Create new PDF document
    const pdf = new jsPDFClass('p', 'mm', 'a4');
    
    let currentY = PDF_CONFIG.margins.top;

    // Add title if provided
    if (title) {
      pdf.setFontSize(PDF_CONFIG.fontSize.title);
      pdf.setFont("helvetica", "bold");
      pdf.text(title, PDF_CONFIG.pageWidth / 2, currentY, { align: 'center' });
      currentY += PDF_CONFIG.fontSize.title * PDF_CONFIG.lineHeight + 10;
    }

    // Process all markdown tokens
    await processTokensForPDF(pdf, tokens, currentY);

    // Convert to blob
    const pdfBlob = pdf.output('blob');
    
    return pdfBlob;
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw new Error("Failed to generate PDF from markdown");
  }
};