package market

// Stocks are USD listings of North American and European companies.
// Demonstration prices below are fictional snapshots, never live quotes.
var catalog = []Asset{
	{ID: "bluai", Symbol: "BLUAI", Name: "BluAI", Kind: "crypto", Region: "Global", Country: "", Venue: "Crypto", Color: "#78a6ff", Mark: "B", Description: "Bluwhale's ecosystem token. No supported Coinbase USD pair is available; this market is a sample preview.", coinbase: ""},
	{ID: "bitcoin", Symbol: "BTC", Name: "Bitcoin", Kind: "crypto", Region: "Global", Country: "", Venue: "Crypto", Color: "#f7931a", Mark: "₿", Description: "The original decentralized digital currency.", coinbase: "BTC-USD"},
	{ID: "ethereum", Symbol: "ETH", Name: "Ethereum", Kind: "crypto", Region: "Global", Country: "", Venue: "Crypto", Color: "#8595ee", Mark: "Ξ", Description: "A blockchain network for smart contracts and decentralized applications.", coinbase: "ETH-USD"},
	{ID: "solana", Symbol: "SOL", Name: "Solana", Kind: "crypto", Region: "Global", Country: "", Venue: "Crypto", Color: "#9f89fa", Mark: "≋", Description: "A blockchain designed for high-throughput applications.", coinbase: "SOL-USD"},
	{ID: "xrp", Symbol: "XRP", Name: "XRP", Kind: "crypto", Region: "Global", Country: "", Venue: "Crypto", Color: "#bbc6d8", Mark: "X", Description: "The native asset of the XRP Ledger.", coinbase: "XRP-USD"},
	{ID: "dogecoin", Symbol: "DOGE", Name: "Dogecoin", Kind: "crypto", Region: "Global", Country: "", Venue: "Crypto", Color: "#c6ab64", Mark: "Ð", Description: "A community-driven digital currency.", coinbase: "DOGE-USD"},
	{ID: "chainlink", Symbol: "LINK", Name: "Chainlink", Kind: "crypto", Region: "Global", Country: "", Venue: "Crypto", Color: "#527cff", Mark: "⬡", Description: "The token supporting Chainlink's oracle network.", coinbase: "LINK-USD"},
	{ID: "cardano", Symbol: "ADA", Name: "Cardano", Kind: "crypto", Region: "Global", Country: "", Venue: "Crypto", Color: "#538bff", Mark: "A", Description: "A proof-of-stake blockchain platform.", coinbase: "ADA-USD"},
	{ID: "nvda", Symbol: "NVDA", Name: "NVIDIA", Kind: "stock", Region: "North America", Country: "United States", Venue: "NASDAQ", Color: "#92c64f", Mark: "N", Description: "Computing platforms for AI, graphics, and accelerated workloads.", coinbase: ""},
	{ID: "aapl", Symbol: "AAPL", Name: "Apple", Kind: "stock", Region: "North America", Country: "United States", Venue: "NASDAQ", Color: "#cbd2dd", Mark: "a", Description: "Consumer devices, software, and digital services.", coinbase: ""},
	{ID: "msft", Symbol: "MSFT", Name: "Microsoft", Kind: "stock", Region: "North America", Country: "United States", Venue: "NASDAQ", Color: "#62abed", Mark: "⊞", Description: "Enterprise software, cloud infrastructure, and productivity tools.", coinbase: ""},
	{ID: "amzn", Symbol: "AMZN", Name: "Amazon", Kind: "stock", Region: "North America", Country: "United States", Venue: "NASDAQ", Color: "#efad58", Mark: "a", Description: "Commerce, cloud computing, and digital services.", coinbase: ""},
	{ID: "googl", Symbol: "GOOGL", Name: "Alphabet", Kind: "stock", Region: "North America", Country: "United States", Venue: "NASDAQ", Color: "#74a4fa", Mark: "G", Description: "Google's parent company, spanning search, cloud, and technology.", coinbase: ""},
	{ID: "tsla", Symbol: "TSLA", Name: "Tesla", Kind: "stock", Region: "North America", Country: "United States", Venue: "NASDAQ", Color: "#ed717b", Mark: "T", Description: "Electric vehicles, energy storage, and related technology.", coinbase: ""},
	{ID: "shop", Symbol: "SHOP", Name: "Shopify", Kind: "stock", Region: "North America", Country: "Canada", Venue: "NASDAQ", Color: "#a2ca6d", Mark: "S", Description: "Commerce software for merchants of all sizes. US-listed shares in USD.", coinbase: ""},
	{ID: "asml", Symbol: "ASML", Name: "ASML", Kind: "stock", Region: "Europe", Country: "Netherlands", Venue: "NASDAQ", Color: "#91a5e8", Mark: "A", Description: "Semiconductor lithography systems. US-listed shares in USD.", coinbase: ""},
	{ID: "sap", Symbol: "SAP", Name: "SAP", Kind: "stock", Region: "Europe", Country: "Germany", Venue: "NYSE · ADR", Color: "#73b9f6", Mark: "SAP", Description: "Enterprise applications and business software. US-listed ADR in USD.", coinbase: ""},
	{ID: "nvo", Symbol: "NVO", Name: "Novo Nordisk", Kind: "stock", Region: "Europe", Country: "Denmark", Venue: "NYSE · ADR", Color: "#819dee", Mark: "N", Description: "A global healthcare company. US-listed ADR in USD.", coinbase: ""},
	{ID: "race", Symbol: "RACE", Name: "Ferrari", Kind: "stock", Region: "Europe", Country: "Italy", Venue: "NYSE", Color: "#f1c169", Mark: "F", Description: "Luxury performance vehicles. US-listed shares in USD.", coinbase: ""},
}
var samplePrices = []float64{0.01284, 97284.62, 3248.75, 182.36, 2.42, 0.2541, 18.74, 0.7286, 142.87, 228.64, 428.76, 218.92, 186.54, 342.18, 112.46, 742.85, 268.32, 84.67, 462.71}
var sampleChanges = []float64{4.82, 2.41, 1.86, 5.24, -0.74, -1.32, 3.15, 0.87, 3.28, 1.12, 0.94, -0.62, 1.74, -2.16, 2.38, 1.65, 0.82, -0.48, 1.24}
