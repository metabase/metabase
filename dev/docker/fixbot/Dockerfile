FROM ubuntu:noble

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl git rlwrap bash ca-certificates gnupg ripgrep sudo tmux \
    # Playwright/Chromium system dependencies
    libnss3 libnspr4 libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 \
    libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
    libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2t64 \
    libdbus-1-3 libx11-xcb1 libxcb1 libxext6 libx11-6 fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Everything is installed as root. Workmux overrides the runtime user with --user $(id -u):$(id -g)
# so files in mounted worktrees are owned by the host user. All tools installed here under /opt
# are world-readable by default.

# Install mise to /opt/mise (shared location, not user-specific)
ENV MISE_DATA_DIR="/opt/mise"
ENV MISE_CONFIG_DIR="/opt/mise/config"
ENV MISE_CACHE_DIR="/opt/mise/cache"
ENV MISE_YES=1
ENV MISE_TRUSTED_CONFIG_PATHS="/"
RUN curl https://mise.run | MISE_INSTALL_PATH=/usr/local/bin/mise sh
ENV PATH="/opt/mise/shims:$PATH"

# Copy container-specific mise.toml (minimal set of tools needed for development)
COPY mise.toml /opt/mise/config/config.toml
RUN mise trust /opt/mise/config/config.toml

# Install tools individually so each gets its own Docker layer cache
RUN mise install node
RUN mise install bun
RUN mise install java
RUN mise install clojure
RUN mise install babashka
RUN mise install python
RUN mise install uv
# Catch any tools added to mise.toml not listed above
RUN mise install

# Activate mise in bash sessions
RUN echo 'eval "$(mise activate bash)"' >> /etc/bash.bashrc

# Install Playwright CLI with Chromium for UI verification
RUN npm install -g playwright && npx playwright install chromium

# Copy bb to /usr/local/bin so it's always available regardless of PATH/symlink issues
RUN cp /opt/mise/shims/bb /usr/local/bin/bb
# Point bin/mage to the copied bb
ENV BB_PATH="/usr/local/bin/bb"

# Install bbin
RUN curl -o- -L https://raw.githubusercontent.com/babashka/bbin/v0.2.5/bbin > /usr/local/bin/bbin \
    && chmod +x /usr/local/bin/bbin
ENV BBIN_DIR="/opt/bbin"
ENV PATH="/opt/bbin/bin:$PATH"

# Install clojure-mcp-light for Clojure development
RUN bbin install https://github.com/bhauman/clojure-mcp-light.git --tag v0.2.2 --as clj-paren-repair-claude-hook
RUN bbin install https://github.com/bhauman/clojure-mcp-light.git --tag v0.2.2 --as clj-nrepl-eval --main-opts '["-m" "clojure-mcp-light.nrepl-eval"]'
RUN bbin install https://github.com/bhauman/clojure-mcp-light.git --tag v0.2.2 --as clj-paren-repair --main-opts '["-m" "clojure-mcp-light.paren-repair"]'

# Install beads (bd) for agent task tracking
RUN npm install -g @beads/bd

# Install Claude Code CLI (direct binary download — the native installer is interactive, this replicates their logic
RUN CLAUDE_CDN="https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases" \
    && CLAUDE_VERSION=$(curl -fsSL "$CLAUDE_CDN/latest") \
    && ARCH=$(uname -m | sed 's/aarch64/arm64/' | sed 's/x86_64/x64/') \
    && echo "Downloading claude $CLAUDE_VERSION for linux-$ARCH (234 MB)..." \
    && curl -fL --progress-bar "$CLAUDE_CDN/$CLAUDE_VERSION/linux-$ARCH/claude" -o /usr/local/bin/claude \
    && chmod +x /usr/local/bin/claude

# Symlink all tools into /usr/local/bin so they're available regardless of PATH
# overrides (workmux sandbox replaces PATH at runtime).
RUN for shim in /opt/mise/shims/*; do \
      name=$(basename "$shim"); \
      [ ! -e "/usr/local/bin/$name" ] && ln -s "$shim" "/usr/local/bin/$name" || true; \
    done && \
    for bin in /root/.local/bin/*; do \
      name=$(basename "$bin"); \
      [ ! -e "/usr/local/bin/$name" ] && cp "$bin" "/usr/local/bin/$name" || true; \
    done

WORKDIR /app

CMD ["/bin/bash"]
