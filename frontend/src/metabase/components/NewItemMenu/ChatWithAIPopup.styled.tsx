import styled from "@emotion/styled";

export const ChatWithAIPopupWrapper = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background-color: #f0f2f5;
  padding: 20px;
`;

export const PopupContent = styled.div`
  background: white;
  padding: 30px;
  border-radius: 12px;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
  max-width: 500px;
  width: 100%;

  @media (max-width: 600px) {
    padding: 20px;
  }
`;

export const Title = styled.h2`
  margin-top: 0;
  margin-bottom: 24px;
  color: #333;
  text-align: center;
`;

export const FormGroup = styled.div`
  margin-bottom: 24px;

  label {
    display: block;
    margin-bottom: 8px;
    font-weight: bold;
    color: #555;
  }

  input[type="text"],
  select {
    width: 100%;
    padding: 10px;
    box-sizing: border-box;
    border: 1px solid #ccc;
    border-radius: 6px;
    font-size: 16px;
  }
`;

export const Checkboxes = styled.div`
  display: flex;
  flex-direction: column;

  div {
    display: flex;
    align-items: center;
    margin-bottom: 8px;
  }

  input {
    margin-right: 10px;
  }
`;

export const Error = styled.div`
  color: #d32f2f;
  margin-bottom: 16px;
  text-align: center;
`;

export const ButtonGroup = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 12px;
`;

export const Button = styled.button`
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 16px;
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

export const PrimaryButton = styled(Button)`
  background-color: #1976d2;
  color: white;

  &:hover {
    background-color: #1565c0;
  }
`;

export const DisclaimerButton = styled.p `
  padding: 10px;
  margin: 20px;
  border: 1px solid #ccc;
  background-color: #f9f9f9;
  font-style: italic;
  color: #555;
  border-radius: 5px;

`
;

export const SecondaryButton = styled(Button)`
  background-color: #e0e0e0;
  color: #333;

  &:hover {
    background-color: #d5d5d5;
  }
`;

export const Backdrop = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(39, 38, 38, 0.5); /* Adjust opacity and color as needed */
  z-index: 1000; /* Ensure it covers other elements */
`;

export const DatabaseButton = styled(Button)<{ isSelected: boolean }>`
  background-color: ${props => props.isSelected ? '#1976d2' : '#e0e0e0'};
  color: ${props => props.isSelected ? 'white' : '#333'};
  font-weight: ${props => props.isSelected ? 'bold' : 'normal'};

  &:hover {
    background-color: ${props => props.isSelected ? '#1565c0' : '#d5d5d5'};
  }
`;

export const LoadingGifContainer = styled.div`
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 1100; /* Ensure it's above the backdrop */
`;

export const LoadingGif = styled.img`
  width: 100px; /* Adjust size as needed */
  height: 100px; /* Adjust size as needed */
`;
