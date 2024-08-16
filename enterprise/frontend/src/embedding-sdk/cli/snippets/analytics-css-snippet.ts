export const ANALYTICS_CSS_SNIPPET = `
.theme-switcher {
  width: 28px;
  height: 28px;
  cursor: pointer;
}

.analytics-container {
  width: 100%;
  max-width: 1000px;
  margin: 0 auto;
  min-height: 100vh;
  padding: 30px 0;
}

.analytics-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 30px 0;
  column-gap: 15px;
}

.analytics-header-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 30px 0;
  column-gap: 15px;
}

.analytics-header-right > a {
  color: #509EE3;
}

.dashboard-select {
  background: transparent;
  color: #509EE3;
  border: none;
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
}

.dashboard-select:focus {
  outline: 1px solid #509EE3;
  border-radius: 2px;
}
`.trim();
