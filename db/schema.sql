CREATE TABLE IF NOT EXISTS game_rooms (
  code VARCHAR(12) PRIMARY KEY,
  host_token_hash CHAR(64) NOT NULL,
  state JSONB NOT NULL CHECK (jsonb_typeof(state) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS game_rooms_updated_at_idx
  ON game_rooms (updated_at DESC);
