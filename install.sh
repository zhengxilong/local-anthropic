#!/usr/bin/env bash
set -euo pipefail

# ── Config ────────────────────────────────────────
REPO_URL="${REPO_URL:-https://github.com/zhengxilong/local-anthropic.git}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local-anthropic}"
BRANCH="${BRANCH:-main}"

# ── Colors ────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }

banner() {
  echo -e "${BOLD}${CYAN}"
  cat <<'BANNER'
  ┌───────────────────────────────────────────┐
  │   Local Anthropic Proxy  ·  One-Click     │
  │   OpenAI-compatible → Anthropic format     │
  └───────────────────────────────────────────┘
BANNER
  echo -e "${NC}"
}

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

One-click installer for the OpenAI-to-Anthropic proxy server.

Options:
  -u, --url URL         OpenAI-compatible API base URL
  -k, --key KEY         API key
  -m, --model MODEL     Model ID (e.g. gpt-4o, deepseek-chat)
  -p, --port PORT       Local proxy port (default: 3000)
  -d, --dir DIR         Install directory (default: ~/.local-anthropic)
      --uninstall       Remove the installed proxy
  -h, --help            Show this help

Environment variables (take precedence over flags):
  OPENAI_BASE_URL       API base URL
  OPENAI_API_KEY        API key
  OPENAI_MODEL          Model ID
  PROXY_PORT            Local port

Examples:
  # Interactive (prompts for values)
  curl -fsSL https://raw.githubusercontent.com/zhengxilong/local-anthropic/main/install.sh | bash

  # Non-interactive with flags
  curl -fsSL https://raw.githubusercontent.com/zhengxilong/local-anthropic/main/install.sh | bash -s -- \\
    -u https://api.example.com/v1 -k sk-xxx -m gpt-4o

  # Non-interactive with env vars
  OPENAI_BASE_URL=https://api.example.com/v1 \\
  OPENAI_API_KEY=sk-xxx OPENAI_MODEL=gpt-4o \\
  curl -fsSL https://raw.githubusercontent.com/zhengxilong/local-anthropic/main/install.sh | bash
EOF
  exit 0
}

# ── Parse args ────────────────────────────────────
UNINSTALL=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    -u|--url)    OPENAI_BASE_URL="${2:-}"; shift 2 ;;
    -k|--key)    OPENAI_API_KEY="${2:-}";   shift 2 ;;
    -m|--model)  OPENAI_MODEL="${2:-}";     shift 2 ;;
    -p|--port)   PROXY_PORT="${2:-}";       shift 2 ;;
    -d|--dir)    INSTALL_DIR="${2:-}";      shift 2 ;;
    --uninstall) UNINSTALL=true;            shift   ;;
    -h|--help)   usage ;;
    *) err "Unknown option: $1"; usage ;;
  esac
done

# ── Uninstall ─────────────────────────────────────
if [[ "$UNINSTALL" == "true" ]]; then
  if [[ -d "$INSTALL_DIR" ]]; then
    info "Removing $INSTALL_DIR..."
    rm -rf "$INSTALL_DIR"
    ok "Uninstalled"
  else
    warn "$INSTALL_DIR does not exist — nothing to remove"
  fi
  exit 0
fi

# ── Deps check ────────────────────────────────────
check_deps() {
  local missing=()
  for cmd in node npm git; do
    if ! command -v "$cmd" &>/dev/null; then
      missing+=("$cmd")
    fi
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    err "Missing required commands: ${missing[*]}"
    echo "Please install them before running this script." >&2
    exit 1
  fi

  # Node version check (need >= 18 for fetch)
  local node_ver
  node_ver=$(node -v | sed 's/v//' | cut -d. -f1)
  if [[ "$node_ver" -lt 18 ]]; then
    err "Node.js >= 18 is required (found $(node -v))"
    exit 1
  fi
}

# ── Prompt helper ─────────────────────────────────
prompt_val() {
  local label="$1" varname="$2" default="${3:-}" is_secret="${4:-false}"

  if [[ "$is_secret" == "true" ]]; then
    if [[ -n "$default" ]]; then
      printf "${BOLD}${label}${NC} [${default}]: " >&2
    else
      printf "${BOLD}${label}${NC}: " >&2
    fi
    read -rs VALUE
    echo "" >&2
  else
    if [[ -n "$default" ]]; then
      printf "${BOLD}${label}${NC} [${default}]: " >&2
    else
      printf "${BOLD}${label}${NC}: " >&2
    fi
    read -r VALUE
  fi

  VALUE="${VALUE:-$default}"
  export "$varname"="$VALUE"
}

# ── Download / update code ────────────────────────
get_code() {
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    info "Updating existing installation at $INSTALL_DIR..."
    cd "$INSTALL_DIR"
    git fetch origin "$BRANCH" --quiet 2>/dev/null || true
    git reset --hard "origin/$BRANCH" --quiet 2>/dev/null || true
  else
    info "Downloading to $INSTALL_DIR..."
    rm -rf "$INSTALL_DIR"
    git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$INSTALL_DIR" --quiet 2>/dev/null
    cd "$INSTALL_DIR"
  fi
  ok "Code ready"
}

# ── Install npm deps ──────────────────────────────
install_deps() {
  info "Installing dependencies..."
  npm install --omit=dev --no-fund --no-audit 2>/dev/null || npm install --omit=dev
  ok "Dependencies installed"
}

# ── Write .env ────────────────────────────────────
write_env() {
  cat > .env <<EOF
OPENAI_BASE_URL=${OPENAI_BASE_URL}
OPENAI_API_KEY=${OPENAI_API_KEY}
OPENAI_MODEL=${OPENAI_MODEL}
PORT=${PROXY_PORT}
DEBUG=0
EOF
  ok "Configuration saved to ${INSTALL_DIR}/.env"
}

# ── Run the proxy ─────────────────────────────────
run_server() {
  info "Starting proxy server..."
  echo ""
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}  Local Anthropic Proxy is running!${NC}"
  echo ""
  echo -e "  Proxy:        ${CYAN}http://localhost:${PROXY_PORT}/v1/messages${NC}"
  echo -e "  Backend:      ${CYAN}${OPENAI_BASE_URL}${NC}"
  echo -e "  Model:        ${CYAN}${OPENAI_MODEL}${NC}"
  echo ""
  echo -e "  ${BOLD}Use with Claude Code:${NC}"
  echo -e "  ${YELLOW}ANTHROPIC_BASE_URL=http://localhost:${PROXY_PORT} claude${NC}"
  echo ""
  echo -e "  ${DIM}Press Ctrl+C to stop${NC}"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  exec node index.js
}

# ── Main ──────────────────────────────────────────

banner
check_deps

# Prompt for missing values (env vars and flags take precedence)
if [[ -z "${OPENAI_BASE_URL:-}" ]]; then
  prompt_val "OpenAI-compatible API Base URL" OPENAI_BASE_URL "" "false"
fi
if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  prompt_val "API Key" OPENAI_API_KEY "" "true"
fi
if [[ -z "${OPENAI_MODEL:-}" ]]; then
  prompt_val "Model ID (e.g. gpt-4o, deepseek-chat)" OPENAI_MODEL "" "false"
fi
if [[ -z "${PROXY_PORT:-}" ]]; then
  prompt_val "Local proxy port" PROXY_PORT "3000" "false"
fi

# Validate required values
for var in OPENAI_BASE_URL OPENAI_API_KEY OPENAI_MODEL; do
  if [[ -z "${!var:-}" ]]; then
    err "$var is required"
    exit 1
  fi
done

# Strip trailing slash from URL
OPENAI_BASE_URL="${OPENAI_BASE_URL%/}"

echo ""
get_code
install_deps
write_env
run_server