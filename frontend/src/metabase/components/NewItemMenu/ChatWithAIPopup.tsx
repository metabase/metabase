import React, { useEffect, useState } from "react";
import axios from "axios";
import type { DatabaseId,Database } from "metabase-types/api";
import {
  ChatWithAIPopupWrapper,
  PopupContent,
  Title,
  FormGroup,
  Checkboxes,
  Error,
  ButtonGroup,
  PrimaryButton,
  SecondaryButton,
  DatabaseButton
} from "./ChatWithAIPopup.styled";

interface ChatWithAIPopupProps {
  onClose: () => void;
  databaseId: DatabaseId;
  onClick: (item: any) => void;
}

const ChatWithAIPopup: React.FC<ChatWithAIPopupProps> = ({ onClose, onClick }) => {
  const [question, setQuestion] = useState<string>("");
  const [viewTable, setViewTable] = useState<boolean>(false);
  const [viewVisualization, setViewVisualization] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [databases, setDatabases] = useState<Database[]>([]);

  const tableApiUrl = "https://h44jxk3hxe.execute-api.us-east-1.amazonaws.com/dev/generate_sql";
  const visualizationApiUrl = "https://uhwye4890j.execute-api.us-east-1.amazonaws.com/dev/generate_visual";

  useEffect(() => {
    fetchDatabases();
  }, []);

  const fetchDatabases = async () => {
    try {
      const response = await axios.get('/api/database');
      if (response.data && Array.isArray(response.data.data)) {
        setDatabases(response.data.data);
      } else {
        console.error('Unexpected response format:', response.data);
        setError('Received unexpected data format from the server.');
      }
    } catch (error) {
      console.error('Error fetching databases:', error);
      setError('Failed to fetch databases. Please try again.');
    }
  };

  const handleSubmit = async () => {
    if (!question || !selectedItem || (!viewTable && !viewVisualization)) {
      setError("Please fill in all fields and select at least one view option.");
      return;
    }

    setError("");
    setLoading(true);

    const apiCalls = [];

    if (viewTable) {
      apiCalls.push(axios.post(
        tableApiUrl,
        { user_query: question },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      ));
    }

    if (viewVisualization) {
      apiCalls.push(axios.post(
        visualizationApiUrl,
        { user_query: question },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      ));
    }

    try {
      const responses = await Promise.all(apiCalls);

      setLoading(false);

      responses.forEach((response) => {
        const result = response.data;
        console.log('Result', result);
        const cardUrl = result.card_url;
        if (cardUrl) {
          window.open(cardUrl, '_blank');
        } else {
          console.error("card_url not found in the response");
        }
      });

      onClose(); // Close the modal after successful submission
    } catch (error: any) {
      setLoading(false);
      console.error("Error fetching data:", error);

      if (error.response) {
        switch (error.response.status) {
          case 400:
            setError("Bad request. Please check your input and try again.");
            break;
          case 404:
            setError("Resource not found. Please try again later.");
            break;
          case 500:
            setError("Internal server error. Please try again later.");
            break;
          default:
            setError(`An error occurred: ${error.response.status}`);
        }
      } else if (error.request) {
        setError("No response received from the server. Please check your internet connection and try again.");
      } else {
        setError("An unexpected error occurred. Please try again.");
      }
    }
  };

  const sendDBIndex = async (item: any) => {
    let indexValue = "";
    switch (item.name) {
      case "automotive":
        indexValue = "llm_vector_db_metadata_indx2";
        break;
      case "Sample Database":
        indexValue = "llm_vector_db_metadata_indx1";
        break;
      case "Chinook":
        indexValue = "llm_vector_db_metadata_indx3";
        break;
      default:
        indexValue = "llm_vector_db_default_index";
        break;
    }
    const payload = {
      name: "INDEX",
      value: indexValue,
    };
    try {
      const response = await axios.post(
        'https://ki1asceryj.execute-api.us-east-1.amazonaws.com/dev/update-parameter',
        payload,
        { headers: { "Content-Type": "application/json" } }
      );
      console.log('DBIndex API response:', response.data);
    } catch (error) {
      console.error('Error sending DBIndex to API:', error);
    }
  };

  const handleItemClick = async (database: any) => {
    const payload = {
      name: "METABASE_DATABASE_NAME",
      value: database.name,
    };

    try {
      const response = await axios.post(
        'https://ki1asceryj.execute-api.us-east-1.amazonaws.com/dev/update-parameter',
        payload,
        { headers: { "Content-Type": "application/json" } }
      );
      console.log('API response:', response.data);
      await sendDBIndex(database);
      setSelectedItem(database);  // Set selected item
     // onClick(item);
    } catch (error) {
      console.error('Error sending item to API:', error);
    }
  };

  return (
    <ChatWithAIPopupWrapper>
      <PopupContent>
        <Title>Chat with AI</Title>
        <FormGroup>
          <label>Select Database:</label>
          <div>
            {databases.length > 0 ? (
              databases.map((database) => (
                <DatabaseButton
                  key={database.id}
                  isSelected={selectedItem && selectedItem.id === database.id}
                  onClick={() => handleItemClick(database)}
                >
                  {database.name}
                </DatabaseButton>
              ))
            ) : (
              <p>No databases available</p>
            )}
          </div>
        </FormGroup>
        <FormGroup>
          <label htmlFor="question">Enter your question:</label>
          <input
            type="text"
            id="question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
        </FormGroup>
        <FormGroup>
          <label>How do you want to view your data?</label>
          <Checkboxes>
            <div>
              <input
                type="checkbox"
                id="viewTable"
                checked={viewTable}
                onChange={(e) => setViewTable(e.target.checked)}
              />
              <label htmlFor="viewTable">Table</label>
            </div>
            <div>
              <input
                type="checkbox"
                id="viewVisualization"
                checked={viewVisualization}
                onChange={(e) => setViewVisualization(e.target.checked)}
              />
              <label htmlFor="viewVisualization">Visualization</label>
            </div>
          </Checkboxes>
        </FormGroup>
        <ButtonGroup>
          <PrimaryButton onClick={handleSubmit} disabled={loading}>
            {loading ? "Loading..." : "View Results"}
          </PrimaryButton>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        </ButtonGroup>
      </PopupContent>
      {error && <Error>{error}</Error>}
    </ChatWithAIPopupWrapper>
  );
};

export default ChatWithAIPopup;
