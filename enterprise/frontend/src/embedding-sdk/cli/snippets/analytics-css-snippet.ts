export const ANALYTICS_CSS_SNIPPET = `
.theme-switcher {
  width: 28px;
  height: 28px;
  cursor: pointer;
}

.analytics-root.theme-light {
  background: #F9FBFC;
}

.analytics-root.theme-dark {
  background: #2D353A;
}

.analytics-container {
  width: 100%;
  max-width: 1000px;
  margin: 0 auto;
  min-height: 100vh;
  padding: 30px 0;
}

.analytics-header,
.analytics-header-left,
.analytics-header-right {
  display: flex;
  align-items: center;
  padding: 30px 0;
  column-gap: 15px;
}

.analytics-header {
  justify-content: space-between;
}

.analytics-header-left {
  justify-content: flex-start;
}

.analytics-header-right {
  justify-content: flex-end;
}

.analytics-header-right > a {
  color: #509EE3;
  text-decoration: none;
}

.dashboard-select {
  background: transparent;
  color: #509EE3;
  border: none;
  font-family: inherit;
  font-size: 16px;
  cursor: pointer;
}

.dashboard-select:focus {
  outline: 1px solid #509EE3;
  border-radius: 2px;
}

.analytics-auth-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;

  color: var(--mb-color-text-primary);
  font-size: 24px;
  text-align: center;
}
`.trim();
