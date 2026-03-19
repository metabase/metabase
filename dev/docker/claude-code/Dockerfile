FROM ubuntu:noble

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl git rlwrap bash ca-certificates gnupg ripgrep sudo \
    # Playwright/Chromium system dependencies
    libnss3 libnspr4 libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 \
    libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
    libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2t64 \
    libdbus-1-3 libx11-xcb1 libxcb1 libxext6 libx11-6 fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user (--dangerously-skip-permissions refuses to run as root)
RUN useradd -m -s /bin/bash claude
RUN echo 'claude ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers

USER claude

# Install mise
RUN curl https://mise.run | sh
ENV PATH="/home/claude/.local/bin:$PATH"

# Copy project mise.toml to install the same tool versions
COPY --chown=claude:claude mise.toml /home/claude/.config/mise/config.toml

# Trust the mise config files so there's no interactive prompt
RUN mise trust /home/claude/.config/mise/config.toml

# Install all tools defined in mise.toml
RUN mise install

# Put mise shims on PATH
RUN echo 'eval "$(mise activate bash)"' >> /home/claude/.bashrc
ENV PATH="/home/claude/.local/share/mise/shims:$PATH"

# Auto-accept mise trust prompts for project configs mounted at runtime
ENV MISE_YES=1

# Install Playwright CLI with Chromium for UI verification
RUN npm install -g playwright && npx playwright install chromium

# Install beads (bd) for agent task tracking
RUN npm install -g @beads/bd

# Create .claude directory so Claude Code can write session data
RUN mkdir -p /home/claude/.claude

WORKDIR /app

ENTRYPOINT ["claude"]
