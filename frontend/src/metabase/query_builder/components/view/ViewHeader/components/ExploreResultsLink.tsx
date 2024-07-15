import React, { useState } from "react";
import { t } from "ttag";
import Link from "metabase/core/components/Link";
import ViewButton from "metabase/query_builder/components/view/ViewButton";
import type Question from "metabase-lib/v1/Question";
import { getUrl as ML_getUrl } from "metabase-lib/v1/urls";
import axios from "axios"; // Import Axios for making HTTP requests
import * as jsonData from './reportData.json';
import { LogoBase64 } from './LogoBase64';

interface ExploreResultsLinkProps {
  question: Question;
}

const CardIdPopover: React.FC<{
  cardId: string;
  setCardId: React.Dispatch<React.SetStateAction<string>>;
  handleDownload: () => void;
  handleClosePopup: () => void;
}> = ({ cardId, setCardId, handleDownload, handleClosePopup }) => {
  const [submitHovered, setSubmitHovered] = useState(false);
  const [cancelHovered, setCancelHovered] = useState(false);

  return (
    <div className="popup" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="popup-inner" style={{ background: 'linear-gradient(to bottom, var(--mb-color-navbar-bg), #38508C, #1A253B)', padding: '20px', borderRadius: '8px', textAlign: 'center', color: '#ecf0f1' }}>
        <h2>Enter Card ID</h2>
        <input
          type="text"
          value={cardId}
          onChange={(e) => setCardId(e.target.value)}
          placeholder="Card ID"
          style={{ marginBottom: '20px', padding: '10px', width: '80%' }}
        />
        <button
          style={{
            margin: '0 10px',
            padding: '10px 20px',
            color: submitHovered ? 'var(--mb-color-brand)' : 'white', // White text color or var(--mb-color-brand) on hover
            border: '2px solid var(--mb-color-brand)', // Border with mb-color-brand
            background: 'none', // Transparent background
            cursor: 'pointer', // Pointer cursor
          }}
          onClick={handleDownload}
          onMouseEnter={() => setSubmitHovered(true)}
          onMouseLeave={() => setSubmitHovered(false)}
        >
          Submit
        </button>
        <button
          style={{
            margin: '0 10px',
            padding: '10px 20px',
            color: cancelHovered ? 'var(--mb-color-brand)' : 'white', // White text color or var(--mb-color-brand) on hover
            border: '2px solid var(--mb-color-brand)', // Border with mb-color-brand
            background: 'none', // Transparent background
            cursor: 'pointer', // Pointer cursor
          }}
          onClick={handleClosePopup}
          onMouseEnter={() => setCancelHovered(true)}
          onMouseLeave={() => setCancelHovered(false)}
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export function ExploreResultsLink({ question }: ExploreResultsLinkProps) {
  const [showPopup, setShowPopup] = useState(false);
  const [cardId, setCardId] = useState("");

  const query = question.isSaved()
    ? question.composeQuestionAdhoc()
    : undefined;

  const button = (
    <ViewButton disabled={!query} medium icon="insight" labelBreakpoint="sm">
      {t`Explore results`}
    </ViewButton>
  );
  const reportButton = (
    <ViewButton medium icon="insight" labelBreakpoint="sm" onClick={() => setShowPopup(true)}>
      {t`Report`}
    </ViewButton>
  );

  function generateReportHTML(jsonData: { heading: any; sections: any[]; }) {
    let htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${jsonData.heading}</title>
        <style>
          body {
            font-family: 'Helvetica Neue', Arial, sans-serif;
            margin: 20px;
            padding: 20px;
            color: #ecf0f1;
            background-color: #0d0d1a;
          }
          h1 {
            color: #ecf0f1;
            font-size: 2.5em;
            border-bottom: 2px solid #2980b9;
            padding-bottom: 0.3em;
            margin-bottom: 0.5em;
          }
          h2 {
            color: #ecf0f1;
            font-size: 2em;
            margin-top: 1.5em;
            margin-bottom: 0.5em;
          }
          p {
            color: #bdc3c7;
            font-size: 1.1em;
            line-height: 1.6em;
            margin-bottom: 1.2em;
          }
          ul {
            color: #bdc3c7;
            font-size: 1.1em;
            line-height: 1.6em;
            margin-bottom: 1.2em;
            list-style-type: square;
            padding-left: 20px;
          }
          .content {
            max-width: 800px;
            margin: 0 auto;
            background: #34495e;
            padding: 20px 30px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
            border-radius: 8px;
          }
          @media (max-width: 600px) {
            body {
              padding: 10px;
            }
            .content {
              padding: 15px 20px;
            }
          }
          .top-left {
            position: absolute;
            top: 20px;
            left: 20px;
            width: 145px;
            height: 60px;
          }
          .bottom-right {
            position: absolute;
            top: 20px;
            left: 20px;
            width: 145px;
            height: 60px;
          }
        </style>
      </head>
      <body>
        <div class="content">
          <img src="${LogoBase64}" class="top-left">
          <h1>${jsonData.heading}</h1>
    `;

    jsonData.sections.forEach(section => {
      htmlContent += `
        <h2>${section.subheading}</h2>
      `;
      section.paragraphs.forEach((paragraph: any) => {
        htmlContent += `
          <p>${paragraph}</p>
        `;
      });

      if (section.insightsSummary) {
        htmlContent += `<h3>Insights Summary</h3><ul>`;
        section.insightsSummary.forEach((insight: any) => {
          htmlContent += `<li>${insight}</li>`;
        });
        htmlContent += `</ul>`;
      }

      if (section.actionableInsights) {
        htmlContent += `<h3>Actionable Insights</h3><ul>`;
        section.actionableInsights.forEach((insight: any) => {
          htmlContent += `<li>${insight}</li>`;
        });
        htmlContent += `</ul>`;
      }

      if (section.forecastSummary) {
        htmlContent += `
          <h3>Forecast Summary</h3>
          <p>${section.forecastSummary}</p>
        `;
      }
    });

    htmlContent += `
        </div>
        <img src="${LogoBase64}" class="bottom-right">
      </body>
      </html>
    `;

    return htmlContent;
  }

  const handleDownload = async () => {
    const payload = { card_id: cardId };

    try {
      // Make the HTTP POST request using Axios
      const response = await axios.post(
        'url_endpoint_here', // Replace with your actual endpoint
        payload,
        { headers: { "Content-Type": "application/json" } }
      );

      // Process response if needed
      const data = response.data;

      // Generate the HTML content from the JSON data
      const htmlContent = generateReportHTML(jsonData);

      // Create a Blob object
      const blob = new Blob([htmlContent], { type: 'text/html' });

      // Create a URL for the Blob
      const downloadUrl = URL.createObjectURL(blob);

      // Create an anchor element and trigger the download
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = 'report.html';
      a.click();

      // Release the URL object
      URL.revokeObjectURL(downloadUrl);

      // Close the popup
      setShowPopup(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      // Handle error as needed
    }
  };

  const handleClosePopup = () => {
    setShowPopup(false);
  };

  return (
    <>
      {query ? (
        <Link to={ML_getUrl(query.setDisplay("table").setSettings({}))}>
          {button}
        </Link>
      ) : (
        button
      )}
      {reportButton}
      {showPopup && (
        <CardIdPopover
          cardId={cardId}
          setCardId={setCardId}
          handleDownload={handleDownload}
          handleClosePopup={handleClosePopup}
        />
      )}
    </>
  );
}
