"""Session-mutation operations for slash commands (/retry, /undo) and
read-only aggregators (/status, /usage). Operates on the webui's own
JSON Session store (api/models.py), not on hermes-agent's SQLite.

Behavior parity reference: gateway/run.py:_handle_*_command in
the hermes-agent repo.
"""
from __future__ import annotations
import logging
from typing import Any

from api.models import get_session

logger = logging.getLogger(__name__)


def retry_last(session_id: str) -> dict[str, Any]:
    """Truncate the session to before the last user message, return its text.

    Mirrors gateway/run.py:_handle_retry_command. Caller (webui frontend)
    is expected to put the returned text back in the composer and call
    send() to resume the conversation -- the agent's gateway calls its own
    _handle_message; the webui has no equivalent in-process pipeline.

    Raises:
        KeyError: session not found
        ValueError: no user message in transcript
    """
    s = get_session(session_id)  # raises KeyError if missing
    history = s.messages or []
    last_user_idx = None
    for i in range(len(history) - 1, -1, -1):
        if history[i].get('role') == 'user':
            last_user_idx = i
            break
    if last_user_idx is None:
        raise ValueError('No previous message to retry.')

    last_user_text = _extract_text(history[last_user_idx].get('content', ''))
    removed_count = len(history) - last_user_idx
    s.messages = history[:last_user_idx]
    s.save()
    return {'last_user_text': last_user_text, 'removed_count': removed_count}


def _extract_text(content: Any) -> str:
    """Flatten message content to plain text. Agent stores either a string
    or a list of {type, text|...} parts; webui needs the user-typed text."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for p in content:
            if isinstance(p, dict) and p.get('type') == 'text':
                parts.append(p.get('text', ''))
        return ' '.join(parts)
    return str(content)
