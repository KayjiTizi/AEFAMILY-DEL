# Discord Channel Manager (AEFAMILY-DEL)

Bot Discord quản lý kênh theo dạng **panel điều khiển** (`/panel`): xem danh sách kênh theo danh mục, chọn hàng loạt và xóa hàng loạt, có phân trang, phiên làm việc (session) và bộ nhớ đệm. Hỗ trợ chạy phân mảnh (shard/cluster) để phục vụ nhiều server.

## Tính năng

- **Lệnh `/panel`**: chỉ dành cho quyền **Administrator** (`setDefaultMemberPermissions(Administrator)`).
  - Hiển thị danh mục + kênh theo từng trang (pagination).
  - Chọn nhiều kênh rồi xóa hàng loạt, có embed trạng thái: danh sách → đã chọn → đang xóa → hoàn tất.
  - Phiên làm việc có TTL (`utils/sessionManager`), tự đụng độ/trùng phiên được kiểm tra (`createSession` / `touchSession` / `endSession`).
- **Quản lý kênh**: `utils/channelManager` (lấy danh mục, lấy kênh trong danh mục, xóa, xóa cache).
- **Bộ nhớ đệm**: `utils/cacheManager` + `node-cache` để giảm gọi API Discord.
- **Phân mảnh**: `cluster/clusterManager` tự nhân shard theo `SHARD_COUNT` / `shardCount`.
- **Dữ liệu bền**: SQLite qua `better-sqlite3` (`database/guildData.js`, `database/logs.js`).
- **Đăng ký lệnh tự động**: quét thư mục `commands/` và đăng ký theo guild (nếu khai báo `guildIds`) hoặc global.
- **Sự kiện**: `events/ready.js`, `events/interactionCreate.js`.

## Cấu hình

Có thể cấu hình bằng **môi trường** (ưu tiên) hoặc file `config.json`:

| Biến môi trường | Thay cho | Mô tả |
| --- | --- | --- |
| `BOT_TOKEN` | `config.json` → `token` | Token bot Discord |
| `CLIENT_ID` | `config.json` → `clientId` | Application ID của bot |
| `SHARD_COUNT` | `config.json` → `shardCount` | Số shard (mặc định 1) |

`config.json` (bị git bỏ qua):

```json
{
  "token": "YOUR_BOT_TOKEN",
  "clientId": "YOUR_CLIENT_ID",
  "shardCount": 1,
  "guildIds": ["ID_SERVER_1", "ID_SERVER_2"]
}
```

- `guildIds` rỗng → đăng ký lệnh **global**; có giá trị → đăng ký lệnh **theo từng server**.
- Nên dùng file `.env` (được `dotenv` nạp sẵn) thay vì commit token.

## Cài đặt

Yêu cầu: **Node.js >= 18**.

```bash
npm install
npm start        # = node index.js
```

## Cấu trúc dự án

```
AEFAMILY-DEL/
├── index.js                 # Entry: nạp sự kiện, đăng ký lệnh, khởi tạo cluster
├── commands/panel.js        # Lệnh /panel (panel quản lý kênh)
├── events/                  # ready, interactionCreate
├── utils/                   # session / channel / cache / pagination manager
├── cluster/clusterManager   # Phân mảnh shard
├── database/                # better-sqlite3 (guildData, logs)
├── config.example.json      # Mẫu cấu hình (copy → config.json)
└── package.json
```

## Giấy phép

[GPL-3.0](LICENSE)
