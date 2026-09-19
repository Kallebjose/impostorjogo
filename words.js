export const WORD_BANK = {
  comidas: [
    ["Pizza", "Hambúrguer"], ["Coxinha", "Pastel"], ["Lasanha", "Macarrão"],
    ["Sushi", "Temaki"], ["Brigadeiro", "Beijinho"], ["Sorvete", "Açaí"],
    ["Arroz", "Risoto"], ["Batata frita", "Mandioca frita"], ["Pão de queijo", "Croissant"],
    ["Churrasco", "Feijoada"], ["Taco", "Burrito"], ["Pudim", "Mousse"],
    ["Hot dog", "Hambúrguer"], ["Panqueca", "Waffle"], ["Bolo", "Torta"],
    ["Frango", "Peru"], ["Bacon", "Linguiça"], ["Café", "Cappuccino"],
    ["Guaraná", "Coca-Cola"], ["Chocolate", "Nutella"]
  ],
  animais: [
    ["Cachorro", "Lobo"], ["Gato", "Tigre"], ["Jacaré", "Crocodilo"],
    ["Cavalo", "Zebra"], ["Golfinho", "Tubarão"], ["Águia", "Falcão"],
    ["Macaco", "Gorila"], ["Coelho", "Lebre"], ["Rato", "Hamster"],
    ["Tartaruga", "Jabuti"], ["Ovelha", "Cabra"], ["Polvo", "Lula"],
    ["Leão", "Tigre"], ["Pato", "Ganso"], ["Galinha", "Peru"],
    ["Baleia", "Golfinho"], ["Pinguim", "Foca"], ["Borboleta", "Mariposa"],
    ["Abelha", "Vespa"], ["Sapo", "Rã"]
  ],
  lugares: [
    ["Praia", "Piscina"], ["Escola", "Faculdade"], ["Shopping", "Supermercado"],
    ["Hospital", "Clínica"], ["Aeroporto", "Rodoviária"], ["Cinema", "Teatro"],
    ["Parque", "Praça"], ["Hotel", "Pousada"], ["Academia", "Estádio"],
    ["Restaurante", "Lanchonete"], ["Museu", "Galeria"], ["Banco", "Lotérica"],
    ["Igreja", "Templo"], ["Delegacia", "Fórum"], ["Fazenda", "Sítio"],
    ["Padaria", "Cafeteria"], ["Balada", "Bar"], ["Biblioteca", "Livraria"],
    ["Escritório", "Coworking"], ["Zoológico", "Aquário"]
  ],
  objetos: [
    ["Celular", "Tablet"], ["Notebook", "Computador"], ["Garfo", "Faca"],
    ["Cadeira", "Sofá"], ["Relógio", "Cronômetro"], ["Caneta", "Lápis"],
    ["Mochila", "Mala"], ["Fone", "Caixa de som"], ["Ventilador", "Ar-condicionado"],
    ["Copo", "Caneca"], ["Chave", "Cadeado"], ["Teclado", "Controle"],
    ["Mouse", "Touchpad"], ["TV", "Monitor"], ["Tênis", "Chinelo"],
    ["Boné", "Chapéu"], ["Óculos", "Lente"], ["Guarda-chuva", "Capa de chuva"],
    ["Escova", "Pente"], ["Vassoura", "Rodo"]
  ],
  jogos: [
    ["Valorant", "Counter-Strike"], ["Minecraft", "Terraria"], ["EA FC", "eFootball"],
    ["Fortnite", "PUBG"], ["GTA", "Saints Row"], ["The Sims", "SimCity"],
    ["Rocket League", "Fall Guys"], ["Among Us", "Goose Goose Duck"],
    ["League of Legends", "Dota 2"], ["Roblox", "Minecraft"], ["UNO", "Poker"],
    ["Xadrez", "Damas"], ["Apex Legends", "Overwatch"], ["Call of Duty", "Battlefield"],
    ["Forza Horizon", "Gran Turismo"], ["Stardew Valley", "Animal Crossing"],
    ["Rust", "DayZ"], ["Raft", "Subnautica"], ["Peak", "Content Warning"],
    ["Gartic", "Skribbl"]
  ],
  marcas: [
    ["Nike", "Adidas"], ["Apple", "Samsung"], ["Coca-Cola", "Pepsi"],
    ["BMW", "Mercedes-Benz"], ["McDonald's", "Burger King"], ["Netflix", "Prime Video"],
    ["PlayStation", "Xbox"], ["Nubank", "Inter"], ["Uber", "99"],
    ["Google", "Microsoft"], ["New Balance", "Asics"], ["Fiat", "Volkswagen"],
    ["Ferrari", "Lamborghini"], ["Intel", "AMD"], ["NVIDIA", "AMD"],
    ["Amazon", "Mercado Livre"], ["iFood", "Rappi"], ["Spotify", "YouTube Music"],
    ["WhatsApp", "Telegram"], ["Instagram", "TikTok"]
  ]
};

export const CATEGORY_LABELS = {
  mix: "Misturado",
  comidas: "Comidas",
  animais: "Animais",
  lugares: "Lugares",
  objetos: "Objetos",
  jogos: "Jogos",
  marcas: "Marcas"
};

export function drawPair(category = "mix") {
  const categories = Object.keys(WORD_BANK);
  const chosenCategory = category === "mix"
    ? categories[Math.floor(Math.random() * categories.length)]
    : category;

  const source = WORD_BANK[chosenCategory] || WORD_BANK.comidas;
  const pair = source[Math.floor(Math.random() * source.length)];

  // Inverte aleatoriamente para não existir "palavra principal" fixa no arquivo.
  return Math.random() < 0.5
    ? { category: chosenCategory, civilianWord: pair[0], impostorWord: pair[1] }
    : { category: chosenCategory, civilianWord: pair[1], impostorWord: pair[0] };
}
