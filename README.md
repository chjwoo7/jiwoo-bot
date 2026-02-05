# Jiwoo Bot - CTF Event Management Bot

Discord bot untuk manajemen event CTF dengan fitur automatic role assignment, forum channel creation, dan participant tracking.

## Features

- 🚩 **CTF Event Creation** - Create scheduled events dengan satu command
- 🎭 **Automatic Role Assignment** - User yang join event otomatis dapat role
- 💬 **Forum Channel Creation** - Forum khusus untuk setiap CTF event
- 📊 **Participant Tracking** - Database tracking semua participants
- 🗄️ **Auto Archiving** - Otomatis archive channel dan cleanup roles setelah event selesai
- 🐳 **Docker Support** - Easy deployment dengan Docker Compose

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Discord Bot Token ([Discord Developer Portal](https://discord.com/developers/applications))

### Setup

1. **Clone repository**
   ```bash
   cd jiwoo-bot
   ```

2. **Create `.env` file**
   ```bash
   cp .env.example .env
   ```

3. **Edit `.env` dengan Discord credentials**
   ```env
   DISCORD_TOKEN="your_bot_token_here"
   CLIENT_ID="your_client_id_here"
   GUILD_ID="your_guild_id_here"
   
   # Update category IDs sesuai server kamu
   ACTIVE_CTF_CATEGORY_ID="your_active_category_id"
   ARCHIVE_CATEGORY_ID="your_archive_category_id"
   
   # Database password (ganti dengan password yang secure)
   DB_PASSWORD=your_secure_password_here
   ```

4. **Deploy commands**
   ```bash
   # Development mode
   docker-compose --profile dev up -d postgres
   npm install
   node deploy-commands.js
   
   # Atau langsung di Docker
   docker-compose --profile dev up
   ```

5. **Start bot**
   ```bash
   # Development mode (with hot reload)
   docker-compose --profile dev up
   
   # Production mode (detached)
   docker-compose --profile prod up -d
   ```

## Bot Permissions

Bot memerlukan permissions berikut:
- ✅ `MANAGE_EVENTS` - Create scheduled events
- ✅ `MANAGE_ROLES` - Create dan assign roles
- ✅ `MANAGE_CHANNELS` - Create dan manage forum channels
- ✅ `SEND_MESSAGES` - Post announcements
- ✅ `EMBED_LINKS` - Send embeds

**IMPORTANT:** Bot role harus **lebih tinggi** dari CTF roles yang dibuat!

## Usage

### Create CTF Event

```
/ctf-event 
  name: PascalCTF 2026
  description: CTF ini max 4 orang
  start_date: 05/02/2026 15:00
  end_date: 06/02/2026 15:00
  url: https://ctf.pascalctf.it/
  team_name: Nusahack
  team_password: secret123
  invite_link: https://ctf.pascalctf.it/teams/invite?code=...
```

**Hasil:**
- ✅ Discord scheduled event created
- ✅ Role `pascalctf-2026` created
- ✅ Forum channel `pascalctf-2026` created
- ✅ Announcement posted
- ✅ Event saved to database

### User Flow

1. **User clicks "Interested" pada event**
   - Otomatis dapat role `pascalctf-2026`
   - Bisa akses forum channel
   - Tercatat di database

2. **Event selesai**
   - Bot post participant list di forum
   - Remove role dari semua participants
   - Move forum ke archive category
   - Delete role
   - Mark event as archived di database

## Docker Commands

```bash
# Start development environment
docker-compose --profile dev up

# Start production environment
docker-compose --profile prod up -d

# View logs
docker-compose logs -f bot

# Stop services
docker-compose down

# Rebuild after code changes
docker-compose build

# Access database
docker-compose exec postgres psql -U jiwoo -d jiwoo_bot

# Backup database
docker-compose exec postgres pg_dump -U jiwoo jiwoo_bot > backup.sql

# Restore database
docker-compose exec -T postgres psql -U jiwoo jiwoo_bot < backup.sql
```

## Development

### Without Docker (Local Development)

1. **Install PostgreSQL locally**
2. **Create database**
   ```bash
   psql -U postgres
   CREATE DATABASE jiwoo_bot;
   CREATE USER jiwoo WITH PASSWORD 'your_password';
   GRANT ALL PRIVILEGES ON DATABASE jiwoo_bot TO jiwoo;
   ```

3. **Run init.sql**
   ```bash
   psql -U jiwoo -d jiwoo_bot -f init.sql
   ```

4. **Update `.env`**
   ```env
   DB_HOST=localhost
   DB_PORT=5432
   ```

5. **Install dependencies & run**
   ```bash
   npm install
   node deploy-commands.js
   node index.js
   ```

### Hot Reload

Development mode menggunakan `node --watch` untuk auto-reload saat code changes.

## Database Schema

### `ctf_events` Table
- `id` - Primary key
- `discord_event_id` - Discord scheduled event ID
- `event_name` - Event name
- `event_slug` - Slug for role/channel name
- `role_id` - Discord role ID
- `channel_id` - Discord forum channel ID
- `start_time` - Event start time
- `end_time` - Event end time
- `is_active` - Active status
- `created_at` - Creation timestamp
- `archived_at` - Archive timestamp

### `event_participants` Table
- `id` - Primary key
- `event_id` - Foreign key to ctf_events
- `user_id` - Discord user ID
- `username` - Discord username
- `joined_at` - Join timestamp

## Troubleshooting

### Bot tidak bisa create role
- Pastikan bot role lebih tinggi dari role lain
- Check permission `MANAGE_ROLES`

### Bot tidak bisa create channel
- Check permission `MANAGE_CHANNELS`
- Pastikan category ID benar

### Database connection error
- Pastikan PostgreSQL running: `docker-compose ps`
- Check `.env` database credentials
- View logs: `docker-compose logs postgres`

### Event cleanup tidak jalan
- Event harus di-set ke status "COMPLETED" di Discord
- Check logs: `docker-compose logs -f bot`

## Credit
@chjwoo